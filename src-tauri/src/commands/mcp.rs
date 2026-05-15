use reqwest::header::{
    HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE, COOKIE, ORIGIN, REFERER, USER_AGENT,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfigInput {
    #[serde(rename = "type")]
    pub server_type: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub cwd: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerTestResult {
    pub ok: bool,
    pub status: String,
    pub message: String,
    pub detail: Option<String>,
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelscopeMcpServerSummary {
    pub id: String,
    pub name: String,
    pub chinese_name: Option<String>,
    pub path: String,
    pub from_site_url: Option<String>,
    pub page_url: Option<String>,
    pub original_abstract: Option<String>,
    pub tags: Vec<String>,
    pub category: Vec<String>,
    pub from_site_icon: Option<String>,
    pub user_host_status: Option<String>,
    pub platform_collected: Option<bool>,
    pub transport_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelscopeMcpServerDetail {
    #[serde(flatten)]
    pub summary: ModelscopeMcpServerSummary,
    pub readme: Option<String>,
    pub transport_configs: HashMap<String, McpServerConfigInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModelscopeRequestProfileInput {
    pub cookie: Option<String>,
    pub csrf_token: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub origin: Option<String>,
    pub accept_language: Option<String>,
    pub x_modelscope_accept_language: Option<String>,
    pub trace_id: Option<String>,
    pub bx_version: Option<String>,
    pub extra_headers: Option<HashMap<String, String>>,
}

const MODELSCOPE_BASE_URL: &str = "https://www.modelscope.cn";
const MODELSCOPE_MCP_PAGE_URL: &str = "https://www.modelscope.cn/mcp";
const MODELSCOPE_MCP_LIST_URL: &str = "https://modelscope.cn/openapi/v1/mcp/servers";
const MODELSCOPE_MCP_EXTRACT_URL: &str = "https://www.modelscope.cn/api/v1/mcp/extract";
const MODELSCOPE_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15";

fn clip_detail(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    const LIMIT: usize = 220;
    if trimmed.chars().count() <= LIMIT {
        return Some(trimmed.to_string());
    }
    Some(trimmed.chars().take(LIMIT).collect::<String>() + " ...")
}

fn response_data(value: Value) -> Value {
    match value {
        Value::Object(map) => map
            .get("Data")
            .cloned()
            .or_else(|| map.get("data").cloned())
            .unwrap_or(Value::Object(map)),
        other => other,
    }
}

fn get_value<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    for key in keys {
        if let Some(item) = value.get(*key) {
            return Some(item);
        }
    }
    None
}

fn value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn value_to_string_array(value: Option<&Value>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };

    match value {
        Value::Array(items) => items.iter().filter_map(value_to_string).collect(),
        Value::String(text) => text
            .split([',', '、', ';', '\n'])
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect(),
        _ => value_to_string(value).into_iter().collect(),
    }
}

fn value_to_bool(value: Option<&Value>) -> Option<bool> {
  let value = value?;
  match value {
        Value::Bool(flag) => Some(*flag),
        Value::Number(number) => Some(number.as_i64().unwrap_or_default() != 0),
        Value::String(text) => match text.trim().to_lowercase().as_str() {
            "true" | "yes" | "y" | "1" => Some(true),
            "false" | "no" | "n" | "0" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn non_empty_string_map(value: Option<&Value>) -> Option<HashMap<String, String>> {
    let value = value?;
    if let Value::Object(map) = value {
        let entries = map
            .iter()
            .filter_map(|(key, item)| value_to_string(item).map(|text| (key.clone(), text)))
            .collect::<HashMap<_, _>>();
        if entries.is_empty() {
            None
        } else {
            Some(entries)
        }
    } else {
        None
    }
}

fn value_to_mcp_server_config(value: &Value, fallback_type: &str) -> Option<McpServerConfigInput> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else if trimmed.starts_with('{') || trimmed.starts_with('[') {
                serde_json::from_str::<Value>(trimmed)
                    .ok()
                    .and_then(|parsed| value_to_mcp_server_config(&parsed, fallback_type))
            } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                Some(McpServerConfigInput {
                    server_type: Some(fallback_type.to_string()),
                    command: None,
                    args: None,
                    env: None,
                    cwd: None,
                    url: Some(trimmed.to_string()),
                })
            } else {
                None
            }
        }
        Value::Array(items) => {
            for item in items {
                if let Some(parsed) = value_to_mcp_server_config(item, fallback_type) {
                    return Some(parsed);
                }
            }
            None
        }
        Value::Object(map) => {
            if let Some(servers) = get_value(value, &["mcpServers", "McpServers"]) {
                if let Value::Object(servers_map) = servers {
                    for server_value in servers_map.values() {
                        if let Some(parsed) =
                            value_to_mcp_server_config(server_value, fallback_type)
                        {
                            return Some(parsed);
                        }
                    }
                }
            }

            let mut config = McpServerConfigInput {
                server_type: get_value(value, &["type"])
                    .and_then(value_to_string)
                    .or_else(|| Some(fallback_type.to_string())),
                command: None,
                args: None,
                env: None,
                cwd: None,
                url: None,
            };

            if let Some(command_value) = map.get("command") {
                match command_value {
                    Value::String(command) => {
                        let trimmed = command.trim();
                        if !trimmed.is_empty() {
                            config.command = Some(trimmed.to_string());
                        }
                    }
                    Value::Array(command_list) => {
                        let parts = command_list
                            .iter()
                            .filter_map(value_to_string)
                            .collect::<Vec<_>>();
                        if let Some((head, tail)) = parts.split_first() {
                            if !head.trim().is_empty() {
                                config.command = Some(head.to_string());
                            }
                            if !tail.is_empty() {
                                config.args = Some(tail.to_vec());
                            }
                        }
                    }
                    _ => {}
                }
            }

            if let Some(args) = map.get("args") {
                let parsed_args = value_to_string_array(Some(args));
                if !parsed_args.is_empty() {
                    config.args = Some(parsed_args);
                }
            }

            if let Some(env) = non_empty_string_map(map.get("env")) {
                config.env = Some(env);
            }

            config.cwd = get_value(value, &["cwd"]).and_then(value_to_string);
            config.url = get_value(value, &["url", "endpoint", "serverUrl"]).and_then(value_to_string);

            if config.command.is_none() && config.url.is_none() {
                if let Some(command) = get_value(value, &["command"]).and_then(value_to_string) {
                    config.command = Some(command);
                }
            }

            if config.command.is_none() && config.url.is_none() {
                return None;
            }
            Some(config)
        }
        _ => None,
    }
}

fn parse_json_object(content: &str) -> Result<Value, String> {
    serde_json::from_str::<Value>(content).map_err(|error| format!("解析 JSON 失败：{error}"))
}

fn build_modelscope_page_url(path: &str, name: &str) -> String {
    format!(
        "{}/mcp/{}/{}",
        MODELSCOPE_BASE_URL,
        path.trim_matches('/'),
        name.trim_matches('/')
    )
}

fn split_modelscope_server_id(server_id: &str) -> Option<(String, String)> {
    let trimmed = server_id.trim().trim_matches('/');
    let (path, name) = trimmed.rsplit_once('/')?;
    if path.trim().is_empty() || name.trim().is_empty() {
        return None;
    }
    Some((path.trim().to_string(), name.trim().to_string()))
}

fn encode_server_id(server_id: &str) -> String {
    server_id
        .trim()
        .replace('%', "%25")
        .replace('@', "%40")
        .replace('/', "%2F")
}

fn build_modelscope_summary(raw: &Value) -> Option<ModelscopeMcpServerSummary> {
    let explicit_id = get_value(raw, &["Id", "id"]).and_then(value_to_string);
    let (path, name) = if let Some(server_id) = explicit_id.clone() {
        split_modelscope_server_id(&server_id)?
    } else {
        (
            get_value(raw, &["Path", "path"]).and_then(value_to_string)?,
            get_value(raw, &["Name", "name"]).and_then(value_to_string)?,
        )
    };
    let page_url = get_value(raw, &["PageUrl", "pageUrl"])
        .and_then(value_to_string)
        .or_else(|| Some(build_modelscope_page_url(&path, &name)));

    let transport_types = value_to_string_array(get_value(
        raw,
        &[
            "TransportTypes",
            "transportTypes",
            "SupportedDeployTransportType",
            "supportedDeployTransportType",
            "transport_type",
            "transportType",
        ],
    ))
    .into_iter()
    .filter(|item| !item.trim().is_empty())
    .collect::<Vec<_>>();

    let mut chinese_name = get_value(raw, &["ChineseName", "chineseName"]).and_then(value_to_string);
    let mut display_name = get_value(raw, &["Name", "name"]).and_then(value_to_string);
    if chinese_name.as_deref().unwrap_or("").trim().is_empty() {
        chinese_name = get_value(raw, &["Publisher", "publisher"]).and_then(value_to_string);
    }
    if display_name.as_deref().unwrap_or("").trim().is_empty() {
        display_name = Some(name.clone());
    }

    Some(ModelscopeMcpServerSummary {
        id: explicit_id.unwrap_or_else(|| format!("{path}/{name}")),
        name: display_name.unwrap_or_else(|| name.clone()),
        chinese_name,
        path,
        from_site_url: get_value(raw, &["FromSiteUrl", "fromSiteUrl", "SourceUrl", "source_url"])
            .and_then(value_to_string),
        page_url,
        original_abstract: get_value(
            raw,
            &[
                "Description",
                "description",
                "AbstractCN",
                "abstractCN",
                "OriginalAbstract",
                "originalAbstract",
                "Abstract",
                "abstract",
            ],
        )
        .and_then(value_to_string),
        tags: value_to_string_array(get_value(raw, &["Tags", "tags"])),
        category: value_to_string_array(get_value(raw, &["Category", "category", "Categories", "categories"])),
        from_site_icon: get_value(raw, &["FromSiteIcon", "fromSiteIcon", "LogoUrl", "logo_url"])
            .and_then(|value| match value {
                Value::Array(items) => items
                    .first()
                    .and_then(|item| {
                        if let Value::Object(map) = item {
                            map.get("url").and_then(value_to_string)
                        } else {
                            value_to_string(item)
                        }
                    }),
                _ => value_to_string(value),
            }),
        user_host_status: get_value(raw, &["UserHostStatus", "userHostStatus"])
            .and_then(value_to_string),
        platform_collected: value_to_bool(get_value(raw, &["PlatformCollected", "platformCollected"])),
        transport_types,
    })
}

fn build_modelscope_detail(raw: Value) -> Option<ModelscopeMcpServerDetail> {
    let mut summary = build_modelscope_summary(&raw)?;
    let mut transport_configs = HashMap::new();

    if let Some(server_configs) = get_value(&raw, &["server_config", "ServerConfig"])
        .and_then(Value::as_array)
    {
        for item in server_configs {
            if let Some(mcp_servers) = get_value(item, &["mcpServers", "McpServers"])
                .and_then(Value::as_object)
            {
                for config in mcp_servers.values() {
                    if let Some(parsed) = value_to_mcp_server_config(config, "stdio") {
                        transport_configs.insert(
                            parsed
                                .server_type
                                .clone()
                                .unwrap_or_else(|| "stdio".to_string()),
                            parsed,
                        );
                    }
                }
            }
        }
    }

    if let Some(operational_urls) = get_value(&raw, &["operational_urls", "OperationalUrls"])
        .and_then(Value::as_array)
    {
        for item in operational_urls {
            if let Some(url) = get_value(item, &["url", "Url"]).and_then(value_to_string) {
                let transport_type = get_value(item, &["transport_type", "transportType"])
                    .and_then(value_to_string)
                    .unwrap_or_else(|| "sse".to_string());
                transport_configs.insert(
                    transport_type.clone(),
                    McpServerConfigInput {
                        server_type: Some(transport_type),
                        command: None,
                        args: None,
                        env: None,
                        cwd: None,
                        url: Some(url),
                    },
                );
            }
        }
    }

    if let Some(config) = get_value(&raw, &["ServerConfig", "serverConfig"])
        .and_then(|value| value_to_mcp_server_config(value, "stdio"))
    {
        transport_configs.insert(
            config
                .server_type
                .clone()
                .unwrap_or_else(|| "stdio".to_string()),
            config,
        );
    }

    if let Some(config) = get_value(&raw, &["SSEServerConfig", "sseServerConfig"])
        .and_then(|value| value_to_mcp_server_config(value, "sse"))
    {
        transport_configs.insert(
            config
                .server_type
                .clone()
                .unwrap_or_else(|| "sse".to_string()),
            config,
        );
    }

    if let Some(config) = get_value(&raw, &["StreamableHTTPServerConfig", "streamableHttpServerConfig"])
        .and_then(|value| value_to_mcp_server_config(value, "streamable_http"))
    {
        transport_configs.insert(
            config
                .server_type
                .clone()
                .unwrap_or_else(|| "streamable_http".to_string()),
            config,
        );
    }

    if transport_configs.is_empty() {
        for fallback in ["stdio", "streamable_http", "sse"] {
            if let Some(config) = value_to_mcp_server_config(&raw, fallback) {
                transport_configs.insert(
                    config
                        .server_type
                        .clone()
                        .unwrap_or_else(|| fallback.to_string()),
                    config,
                );
                break;
            }
        }
    }

    let readme = get_value(&raw, &["OriginalReadme", "originalReadme", "Readme", "readme"])
        .and_then(value_to_string);

    if summary.transport_types.is_empty() {
        summary.transport_types = transport_configs.keys().cloned().collect::<Vec<_>>();
    }

    Some(ModelscopeMcpServerDetail {
        summary,
        readme,
        transport_configs,
    })
}

fn build_modelscope_headers(
    cookie: Option<&str>,
    profile: Option<&ModelscopeRequestProfileInput>,
) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json, text/plain, */*"));
    headers.insert(
        USER_AGENT,
        HeaderValue::from_str(
            profile
                .and_then(|item| item.user_agent.as_deref())
                .unwrap_or(MODELSCOPE_USER_AGENT),
        )
        .unwrap_or_else(|_| HeaderValue::from_static(MODELSCOPE_USER_AGENT)),
    );
    headers.insert(
        REFERER,
        HeaderValue::from_str(
            profile
                .and_then(|item| item.referer.as_deref())
                .unwrap_or(MODELSCOPE_MCP_PAGE_URL),
        )
        .unwrap_or_else(|_| HeaderValue::from_static(MODELSCOPE_MCP_PAGE_URL)),
    );
    headers.insert(
        ORIGIN,
        HeaderValue::from_str(
            profile
                .and_then(|item| item.origin.as_deref())
                .unwrap_or(MODELSCOPE_BASE_URL),
        )
        .unwrap_or_else(|_| HeaderValue::from_static(MODELSCOPE_BASE_URL)),
    );
    if let Some(value) = profile
        .and_then(|item| item.accept_language.as_deref())
        .filter(|item| !item.trim().is_empty())
    {
        if let Ok(header) = HeaderValue::from_str(value) {
            headers.insert(reqwest::header::ACCEPT_LANGUAGE, header);
        }
    }
    if let Some(value) = profile
        .and_then(|item| item.x_modelscope_accept_language.as_deref())
        .filter(|item| !item.trim().is_empty())
    {
        if let Ok(header) = HeaderValue::from_str(value) {
            headers.insert(
                reqwest::header::HeaderName::from_static("x-modelscope-accept-language"),
                header,
            );
        }
    }
    if let Some(value) = profile
        .and_then(|item| item.trace_id.as_deref())
        .filter(|item| !item.trim().is_empty())
    {
        if let Ok(header) = HeaderValue::from_str(value) {
            headers.insert(
                reqwest::header::HeaderName::from_static("x-modelscope-trace-id"),
                header,
            );
        }
    }
    if let Some(value) = profile
        .and_then(|item| item.bx_version.as_deref())
        .filter(|item| !item.trim().is_empty())
    {
        if let Ok(header) = HeaderValue::from_str(value) {
            headers.insert(
                reqwest::header::HeaderName::from_static("bx-v"),
                header,
            );
        }
    }
    headers.insert(
        reqwest::header::HeaderName::from_static("x-requested-with"),
        HeaderValue::from_static("XMLHttpRequest"),
    );
    if let Some(value) = profile
        .and_then(|item| item.csrf_token.as_deref())
        .filter(|item| !item.trim().is_empty())
    {
        if let Ok(header) = HeaderValue::from_str(value) {
            headers.insert(
                reqwest::header::HeaderName::from_static("x-csrf-token"),
                header,
            );
        }
    }
    if let Some(cookie) = cookie {
        if let Ok(value) = HeaderValue::from_str(cookie) {
            headers.insert(COOKIE, value);
        }
    }
    if let Some(extra_headers) = profile.and_then(|item| item.extra_headers.as_ref()) {
        for (key, value) in extra_headers {
            if key.eq_ignore_ascii_case("cookie") {
                continue;
            }
            if let Ok(name) = reqwest::header::HeaderName::from_bytes(key.as_bytes()) {
                if let Ok(header_value) = HeaderValue::from_str(value) {
                    headers.insert(name, header_value);
                }
            }
        }
    }
    headers
}

async fn prime_modelscope_cookie(client: &reqwest::Client) -> Option<String> {
    let response = client
        .get(MODELSCOPE_MCP_PAGE_URL)
        .headers(build_modelscope_headers(None, None))
        .send()
        .await
        .ok()?;
    let cookies = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|value| value.to_str().ok())
        .filter_map(|value| value.split(';').next().map(str::trim))
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    if cookies.is_empty() {
        None
    } else {
        Some(cookies.join("; "))
    }
}

async fn modelscope_request_json(
    method: reqwest::Method,
    url: &str,
    query: Option<&[(&str, String)]>,
    body: Option<Value>,
    profile: Option<&ModelscopeRequestProfileInput>,
) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| format!("HTTP client 创建失败：{error}"))?;

    if let Some(profile) = profile {
        if let Some(cookie) = profile.cookie.as_deref() {
            let trimmed = cookie.trim();
            if !trimmed.is_empty() {
                let mut cookie_parts = vec![trimmed.to_string()];
                let cookie = cookie_parts.join("; ");
                let mut request = client
                    .request(method.clone(), url)
                    .headers(build_modelscope_headers(
                        Some(cookie.as_str()),
                        Some(profile),
                    ));
                if let Some(query) = query {
                    request = request.query(query);
                }
                if let Some(ref body) = body {
                    request = request.json(&body);
                }

                let response = request
                    .send()
                    .await
                    .map_err(|error| format!("ModelScope 请求失败：{error}"))?;

                let status = response.status();
                let text = response
                    .text()
                    .await
                    .map_err(|error| format!("读取 ModelScope 响应失败：{error}"))?;
                if status.is_success() {
                    return serde_json::from_str::<Value>(&text).map_err(|error| {
                        format!(
                            "ModelScope 响应不是有效 JSON：{error}，原文：{}",
                            clip_detail(&text).unwrap_or_else(|| "无响应详情".to_string())
                        )
                    });
                }

                if text.contains("aliyun_waf") || text.contains("renderData") {
                    if let Some(challenge_cookie) = solve_modelscope_waf_cookie(&text).await {
                        cookie_parts.push(format!("acw_sc__v2={challenge_cookie}"));
                        let retry_cookie = cookie_parts.join("; ");
                        let mut retry_request = client
                            .request(method, url)
                            .headers(build_modelscope_headers(
                                Some(retry_cookie.as_str()),
                                Some(profile),
                            ));
                        if let Some(query) = query {
                            retry_request = retry_request.query(query);
                        }
                        if let Some(ref body) = body {
                            retry_request = retry_request.json(&body);
                        }
                        let retry_response = retry_request
                            .send()
                            .await
                            .map_err(|error| format!("ModelScope 重试请求失败：{error}"))?;
                        let retry_status = retry_response.status();
                        let retry_text = retry_response
                            .text()
                            .await
                            .map_err(|error| format!("读取 ModelScope 重试响应失败：{error}"))?;
                        if retry_status.is_success() {
                            return serde_json::from_str::<Value>(&retry_text).map_err(|error| {
                                format!(
                                    "ModelScope 重试后仍不是 JSON：{error}，原文：{}",
                                    clip_detail(&retry_text)
                                        .unwrap_or_else(|| "无响应详情".to_string())
                                )
                            });
                        }
                        return Err(format!(
                            "ModelScope 重试返回错误 HTTP {}：{}",
                            retry_status.as_u16(),
                            clip_detail(&retry_text).unwrap_or_else(|| "无响应详情".to_string())
                        ));
                    }
                }

                return Err(format!(
                    "ModelScope 返回错误 HTTP {}：{}",
                    status.as_u16(),
                    clip_detail(&text).unwrap_or_else(|| "无响应详情".to_string())
                ));
            }
        }
    }
    let mut cookie_parts = Vec::new();
    if let Some(cookie) = prime_modelscope_cookie(&client).await {
        cookie_parts.push(cookie);
    }
    let cookie = cookie_parts.join("; ");
    let mut request = client
        .request(method.clone(), url)
        .headers(build_modelscope_headers(
            if cookie.is_empty() { None } else { Some(cookie.as_str()) },
            profile,
        ));
    if let Some(query) = query {
        request = request.query(query);
    }
    if let Some(ref body) = body {
        request = request.json(&body);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("ModelScope 请求失败：{error}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("读取 ModelScope 响应失败：{error}"))?;
    if !status.is_success() {
        return Err(format!(
            "ModelScope 返回错误 HTTP {}：{}",
            status.as_u16(),
            clip_detail(&text).unwrap_or_else(|| "无响应详情".to_string())
        ));
    }

    let parsed = parse_json_object(&text);
    let parsed = match parsed {
        Ok(value) => value,
        Err(_) => {
            if text.contains("aliyun_waf") || text.contains("renderData") {
                if let Some(challenge_cookie) = solve_modelscope_waf_cookie(&text).await {
                    let mut retry_cookies = cookie_parts;
                    retry_cookies.push(format!("acw_sc__v2={challenge_cookie}"));
                    let retry_cookie = retry_cookies.join("; ");
                    let mut retry_request = client
                        .request(method, url)
                        .headers(build_modelscope_headers(
                            Some(retry_cookie.as_str()),
                            profile,
                        ));
                    if let Some(query) = query {
                        retry_request = retry_request.query(query);
                    }
                    if let Some(ref body) = body {
                        retry_request = retry_request.json(&body);
                    }
                    let retry_response = retry_request
                        .send()
                        .await
                        .map_err(|error| format!("ModelScope 重试请求失败：{error}"))?;
                    let retry_status = retry_response.status();
                    let retry_text = retry_response
                        .text()
                        .await
                        .map_err(|error| format!("读取 ModelScope 重试响应失败：{error}"))?;
                    if retry_status.is_success() {
                        return serde_json::from_str::<Value>(&retry_text).map_err(|error| {
                            format!(
                                "ModelScope 重试后仍不是 JSON：{error}，原文：{}",
                                clip_detail(&retry_text)
                                    .unwrap_or_else(|| "无响应详情".to_string())
                            )
                        });
                    }
                    return Err(format!(
                        "ModelScope 重试返回错误 HTTP {}：{}",
                        retry_status.as_u16(),
                        clip_detail(&retry_text).unwrap_or_else(|| "无响应详情".to_string())
                    ));
                }
            }
            return Err(format!(
                "ModelScope 响应不是有效 JSON：{}，原文：{}",
                "解析 JSON 失败",
                clip_detail(&text).unwrap_or_else(|| "无响应详情".to_string())
            ));
        }
    };

    Ok(parsed)
}

async fn solve_modelscope_waf_cookie(html: &str) -> Option<String> {
    let script = r#"
import { JSDOM, VirtualConsole } from "jsdom";

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const html = chunks.join("");
const vc = new VirtualConsole();
vc.on("jsdomError", () => {});
const dom = new JSDOM(html, {
  url: "https://www.modelscope.cn/mcp?page=1",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
await new Promise((resolve) => setTimeout(resolve, 200));
const cookie = dom.window.document.cookie
  .split("; ")
  .find((item) => item.startsWith("acw_sc__v2=")) ?? "";
process.stdout.write(cookie);
"#;

    let mut child = Command::new("node")
        .arg("--input-type=module")
        .arg("-e")
        .arg(script)
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(html.as_bytes()).await.is_err() {
            let _ = child.kill().await;
            return None;
        }
    }

    let output = timeout(Duration::from_secs(6), child.wait_with_output())
        .await
        .ok()?
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    text.strip_prefix("acw_sc__v2=")
        .map(ToString::to_string)
        .filter(|value| !value.trim().is_empty())
}

fn parse_sse_payload(body: &str) -> Option<Value> {
    for line in body.lines() {
        if let Some(raw) = line.strip_prefix("data:") {
            let text = raw.trim();
            if text.is_empty() {
                continue;
            }
            if let Ok(value) = serde_json::from_str::<Value>(text) {
                return Some(value);
            }
        }
    }
    None
}

#[derive(Clone, Copy)]
enum McpStdioRequestMode {
    NewlineJson,
    ContentLength,
}

fn build_mcp_initialize_payload() -> Value {
    json!({
      "jsonrpc": "2.0",
      "id": 1,
      "method": "initialize",
      "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {
          "name": "ai-modal",
          "version": "0.6.0"
        }
      }
    })
}

async fn read_mcp_stdio_response(stdout: tokio::process::ChildStdout) -> Result<Value, String> {
    let mut reader = BufReader::new(stdout);
    let mut first_line = String::new();
    let bytes = timeout(Duration::from_secs(5), reader.read_line(&mut first_line))
        .await
        .map_err(|_| "读取 MCP 响应超时".to_string())?
        .map_err(|error| format!("读取 MCP 响应失败: {error}"))?;

    if bytes == 0 {
        return Err("MCP 进程未返回任何响应".to_string());
    }

    let trimmed = first_line.trim();
    if trimmed.starts_with('{') {
        return serde_json::from_str(trimmed)
            .map_err(|error| format!("解析 MCP JSON 响应失败: {error}"));
    }

    if trimmed.to_ascii_lowercase().starts_with("content-length:") {
        let length = trimmed
            .split(':')
            .nth(1)
            .map(str::trim)
            .ok_or_else(|| "MCP Content-Length 头缺失长度".to_string())?
            .parse::<usize>()
            .map_err(|error| format!("解析 MCP Content-Length 失败: {error}"))?;

        let mut line = String::new();
        loop {
            line.clear();
            let read = timeout(Duration::from_secs(5), reader.read_line(&mut line))
                .await
                .map_err(|_| "读取 MCP 响应头超时".to_string())?
                .map_err(|error| format!("读取 MCP 响应头失败: {error}"))?;
            if read == 0 {
                return Err("MCP 响应头意外结束".to_string());
            }
            if line.trim().is_empty() {
                break;
            }
        }

        let mut body = vec![0_u8; length];
        timeout(Duration::from_secs(5), reader.read_exact(&mut body))
            .await
            .map_err(|_| "读取 MCP 响应体超时".to_string())?
            .map_err(|error| format!("读取 MCP 响应体失败: {error}"))?;

        return serde_json::from_slice::<Value>(&body)
            .map_err(|error| format!("解析 MCP Content-Length 响应失败: {error}"));
    }

    Err(format!("未识别的 MCP stdio 响应头: {}", clip_detail(trimmed).unwrap_or_default()))
}

async fn run_stdio_initialize_handshake(
    config: &McpServerConfigInput,
    mode: McpStdioRequestMode,
) -> McpServerTestResult {
    let command = config.command.clone().unwrap_or_default();
    let started_at = Instant::now();
    let mut cmd = Command::new(command);
    cmd.args(config.args.clone().unwrap_or_default());
    cmd.kill_on_drop(true);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::null());
    if let Some(cwd) = config.cwd.clone() {
        if !cwd.trim().is_empty() {
            cmd.current_dir(cwd);
        }
    }
    if let Some(env) = config.env.clone() {
        cmd.envs(env);
    }

    let mut child = match cmd.spawn() {
        Ok(v) => v,
        Err(error) => {
            return McpServerTestResult {
                ok: false,
                status: "spawn-failed".to_string(),
                message: format!("进程启动失败: {error}"),
                detail: None,
                latency_ms: Some(started_at.elapsed().as_millis() as u64),
            };
        }
    };

    let payload = build_mcp_initialize_payload();
    let body = match serde_json::to_string(&payload) {
        Ok(text) => text,
        Err(error) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return McpServerTestResult {
                ok: false,
                status: "error".to_string(),
                message: format!("序列化 initialize 请求失败: {error}"),
                detail: None,
                latency_ms: Some(started_at.elapsed().as_millis() as u64),
            };
        }
    };

    let request = match mode {
        McpStdioRequestMode::NewlineJson => format!("{body}\n"),
        McpStdioRequestMode::ContentLength => {
            format!("Content-Length: {}\r\n\r\n{}", body.len(), body)
        }
    };

    let Some(mut stdin) = child.stdin.take() else {
        let _ = child.kill().await;
        let _ = child.wait().await;
        return McpServerTestResult {
            ok: false,
            status: "error".to_string(),
            message: "MCP 进程未暴露 stdin".to_string(),
            detail: None,
            latency_ms: Some(started_at.elapsed().as_millis() as u64),
        };
    };

    if let Err(error) = stdin.write_all(request.as_bytes()).await {
        let _ = child.kill().await;
        let _ = child.wait().await;
        return McpServerTestResult {
            ok: false,
            status: "write-failed".to_string(),
            message: format!("发送 initialize 请求失败: {error}"),
            detail: None,
            latency_ms: Some(started_at.elapsed().as_millis() as u64),
        };
    }
    let _ = stdin.flush().await;
    drop(stdin);

    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill().await;
        let _ = child.wait().await;
        return McpServerTestResult {
            ok: false,
            status: "error".to_string(),
            message: "MCP 进程未暴露 stdout".to_string(),
            detail: None,
            latency_ms: Some(started_at.elapsed().as_millis() as u64),
        };
    };

    let result = read_mcp_stdio_response(stdout).await;
    let _ = child.kill().await;
    let _ = child.wait().await;

    match result {
        Ok(value) => {
            let server_name = value
                .pointer("/result/serverInfo/name")
                .and_then(Value::as_str)
                .unwrap_or("MCP Server");
            let server_version = value
                .pointer("/result/serverInfo/version")
                .and_then(Value::as_str)
                .unwrap_or("");
            let detail = if server_version.is_empty() {
                Some(server_name.to_string())
            } else {
                Some(format!("{server_name} {server_version}"))
            };
            McpServerTestResult {
                ok: true,
                status: "stdio-initialize-ok".to_string(),
                message: "初始化握手成功".to_string(),
                detail,
                latency_ms: Some(started_at.elapsed().as_millis() as u64),
            }
        }
        Err(message) => McpServerTestResult {
            ok: false,
            status: "stdio-initialize-failed".to_string(),
            message,
            detail: Some(match mode {
                McpStdioRequestMode::NewlineJson => "newline-json initialize".to_string(),
                McpStdioRequestMode::ContentLength => "content-length initialize".to_string(),
            }),
            latency_ms: Some(started_at.elapsed().as_millis() as u64),
        },
    }
}

async fn test_http_server(url: &str) -> McpServerTestResult {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build();
    let client = match client {
        Ok(v) => v,
        Err(error) => {
            return McpServerTestResult {
                ok: false,
                status: "error".to_string(),
                message: format!("构建 HTTP 客户端失败: {error}"),
                detail: None,
                latency_ms: None,
            };
        }
    };

    let body = json!({
      "jsonrpc": "2.0",
      "id": 1,
      "method": "initialize",
      "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {
          "name": "ai-modal",
          "version": "0.6.0"
        }
      }
    });

    let started_at = Instant::now();
    let response = client
        .post(url)
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "application/json, text/event-stream")
        .json(&body)
        .send()
        .await;

    let response = match response {
        Ok(v) => v,
        Err(error) => {
            return McpServerTestResult {
                ok: false,
                status: "error".to_string(),
                message: format!("请求失败: {error}"),
                detail: None,
                latency_ms: Some(started_at.elapsed().as_millis() as u64),
            };
        }
    };

    let code = response.status().as_u16();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let text = match response.text().await {
        Ok(v) => v,
        Err(error) => {
            return McpServerTestResult {
                ok: false,
                status: "error".to_string(),
                message: format!("读取响应失败: {error}"),
                detail: None,
                latency_ms: Some(started_at.elapsed().as_millis() as u64),
            };
        }
    };

    let latency_ms = Some(started_at.elapsed().as_millis() as u64);
    if code < 200 || code >= 300 {
        return McpServerTestResult {
            ok: false,
            status: format!("HTTP {code}"),
            message: format!("握手失败 HTTP {code}"),
            detail: clip_detail(&text),
            latency_ms,
        };
    }

    let payload = if content_type.contains("text/event-stream") {
        parse_sse_payload(&text)
    } else {
        serde_json::from_str::<Value>(&text).ok()
    };

    if let Some(value) = payload {
        let server_name = value
            .pointer("/result/serverInfo/name")
            .and_then(Value::as_str)
            .unwrap_or("MCP Server");
        let server_version = value
            .pointer("/result/serverInfo/version")
            .and_then(Value::as_str)
            .unwrap_or("");
        let detail = if server_version.is_empty() {
            Some(server_name.to_string())
        } else {
            Some(format!("{server_name} {server_version}"))
        };
        return McpServerTestResult {
            ok: true,
            status: format!("HTTP {code}"),
            message: "初始化握手成功".to_string(),
            detail,
            latency_ms,
        };
    }

    McpServerTestResult {
        ok: true,
        status: format!("HTTP {code}"),
        message: "服务有响应，但未解析到标准 initialize 结果".to_string(),
        detail: clip_detail(&text),
        latency_ms,
    }
}

async fn test_stdio_server(config: &McpServerConfigInput) -> McpServerTestResult {
    let command = config.command.clone().unwrap_or_default();
    if command.trim().is_empty() {
        return McpServerTestResult {
            ok: false,
            status: "error".to_string(),
            message: "缺少 command".to_string(),
            detail: None,
            latency_ms: None,
        };
    }

    let primary = run_stdio_initialize_handshake(config, McpStdioRequestMode::NewlineJson).await;
    if primary.ok {
        return primary;
    }

    let fallback = run_stdio_initialize_handshake(config, McpStdioRequestMode::ContentLength).await;
    if fallback.ok {
        return fallback;
    }

    McpServerTestResult {
        ok: false,
        status: "stdio-initialize-failed".to_string(),
        message: "初始化握手失败".to_string(),
        detail: Some(format!(
            "newline: {}; content-length: {}",
            primary.message, fallback.message
        )),
        latency_ms: fallback.latency_ms.or(primary.latency_ms),
    }
}

#[tauri::command]
pub async fn test_mcp_server(
    _name: String,
    config: McpServerConfigInput,
) -> Result<McpServerTestResult, String> {
    let server_type = config
        .server_type
        .clone()
        .unwrap_or_else(|| "stdio".to_string());

    if server_type.eq_ignore_ascii_case("http") {
        let url = config.url.clone().unwrap_or_default();
        if url.trim().is_empty() {
            return Ok(McpServerTestResult {
                ok: false,
                status: "error".to_string(),
                message: "缺少 url".to_string(),
                detail: None,
                latency_ms: None,
            });
        }
        return Ok(test_http_server(url.trim()).await);
    }

    Ok(test_stdio_server(&config).await)
}

#[tauri::command]
pub async fn search_modelscope_mcp_servers(
    query: String,
    limit: Option<u32>,
    profile: Option<ModelscopeRequestProfileInput>,
) -> Result<Value, String> {
    let trimmed_query = query.trim();
    let page_size = limit.unwrap_or(24).clamp(1, 100);
    let search_text = trimmed_query;

    let parsed = modelscope_request_json(
        reqwest::Method::PUT,
        MODELSCOPE_MCP_LIST_URL,
        None,
        Some(json!({
            "search": search_text,
            "total_count": page_size,
        })),
        profile.as_ref(),
    )
    .await?;
    Ok(parsed)
}

#[tauri::command]
pub async fn inspect_modelscope_mcp_server(
    server_id: String,
    profile: Option<ModelscopeRequestProfileInput>,
) -> Result<Value, String> {
    let trimmed_id = server_id.trim();
    if trimmed_id.is_empty() {
        return Err("缺少 MCP 服务的 serverId".to_string());
    }

    let detail_url = format!(
        "{}/{}",
        MODELSCOPE_MCP_LIST_URL,
        encode_server_id(trimmed_id)
    );

    let parsed_with_operational = modelscope_request_json(
        reqwest::Method::GET,
        detail_url.as_str(),
        Some(&[("get_operational_url", "true".to_string())]),
        None,
        profile.as_ref(),
    )
    .await;

    let parsed = match parsed_with_operational {
        Ok(value) => value,
        Err(error)
            if error.contains("HTTP 401") || error.contains("InvalidAuthentication") =>
        {
            modelscope_request_json(
                reqwest::Method::GET,
                detail_url.as_str(),
                None,
                None,
                profile.as_ref(),
            )
            .await?
        }
        Err(error) => return Err(error),
    };
    Ok(parsed)
}

#[tauri::command]
pub async fn extract_modelscope_mcp_server(url: String) -> Result<ModelscopeMcpServerDetail, String> {
    extract_modelscope_mcp_server_with_profile(url, None).await
}

#[tauri::command]
pub async fn extract_modelscope_mcp_server_with_profile(
    url: String,
    profile: Option<ModelscopeRequestProfileInput>,
) -> Result<ModelscopeMcpServerDetail, String> {
    let trimmed_url = url.trim();
    if trimmed_url.is_empty() {
        return Err("请先填写要提取的 URL".to_string());
    }

    let attempts = [
        json!({ "url": trimmed_url }),
        json!({ "Url": trimmed_url }),
    ];

    let mut last_error = None;
    for body in attempts {
        match modelscope_request_json(
            reqwest::Method::POST,
            MODELSCOPE_MCP_EXTRACT_URL,
            None,
            Some(body),
            profile.as_ref(),
        )
        .await
        {
            Ok(parsed) => {
                let data = response_data(parsed);
                if let Some(detail) = build_modelscope_detail(data) {
                    return Ok(detail);
                }
                last_error = Some("无法解析提取结果".to_string());
            }
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| "提取 ModelScope MCP 失败".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn python_stdio_config(script: &str) -> McpServerConfigInput {
        McpServerConfigInput {
            server_type: Some("stdio".to_string()),
            command: Some("python3".to_string()),
            args: Some(vec!["-c".to_string(), script.to_string()]),
            env: None,
            cwd: None,
            url: None,
        }
    }

    #[tokio::test]
    async fn stdio_initialize_handshake_supports_newline_json() {
        let script = r#"
import json, sys
line = sys.stdin.readline()
req = json.loads(line)
resp = {
  "jsonrpc": "2.0",
  "id": req["id"],
  "result": {
    "protocolVersion": "2024-11-05",
    "serverInfo": { "name": "newline-mcp", "version": "1.0.0" },
    "capabilities": {}
  }
}
sys.stdout.write(json.dumps(resp) + "\n")
sys.stdout.flush()
"#;

        let result = test_stdio_server(&python_stdio_config(script)).await;

        assert!(result.ok, "expected newline stdio initialize to pass: {:?}", result.detail);
        assert_eq!(result.message, "初始化握手成功");
        assert_eq!(result.status, "stdio-initialize-ok");
    }

    #[tokio::test]
    async fn stdio_initialize_handshake_falls_back_to_content_length() {
        let script = r#"
import json, sys
header = sys.stdin.readline()
if not header.lower().startswith("content-length:"):
    sys.exit(1)
length = int(header.split(":")[1].strip())
sys.stdin.readline()
body = sys.stdin.read(length)
req = json.loads(body)
resp = {
  "jsonrpc": "2.0",
  "id": req["id"],
  "result": {
    "protocolVersion": "2024-11-05",
    "serverInfo": { "name": "content-length-mcp", "version": "1.0.0" },
    "capabilities": {}
  }
}
payload = json.dumps(resp)
sys.stdout.write(f"Content-Length: {len(payload)}\r\n\r\n{payload}")
sys.stdout.flush()
"#;

        let result = test_stdio_server(&python_stdio_config(script)).await;

        assert!(result.ok, "expected content-length fallback to pass: {:?}", result.detail);
        assert_eq!(result.message, "初始化握手成功");
        assert_eq!(result.status, "stdio-initialize-ok");
    }
}
