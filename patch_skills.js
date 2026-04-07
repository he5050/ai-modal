const fs = require('fs');
let content = fs.readFileSync('src/components/SkillsPage.tsx', 'utf8');

// Replace mode buttons - remove browse
content = content.replace(
  /\[&quot;browse&quot;,\s*&quot;浏览仓库&quot;,\]\s*\n\s*\[&quot;search&quot;,\s*&quot;搜索技能&quot;,\]/,
  '[&quot;search&quot;, &quot;搜索技能&quot;,]'
);

// Remove browse panel entirely
content = content.replace(
  /\/\*\* Browse mode \*\*\/[\s\S]*?installMode === ['&quot;]browse['&quot;] && \([\s\S]*?\{true\)\}\n                \}\n                \}\n                \}\n/,
  ''
);

// Replace search panel with new design
const oldSearchPanelStart = &quot;                {/* Search mode */}&quot;;
const oldSearchPanel = &quot;                {/* Search mode */}
                {installMode === 'search' && (
                  <div className=\&quot;space-y-3\&quot;>
                    <div className=\&quot;flex items-center gap-2\&quot;>
                      <div className=\&quot;relative flex-1\&quot;>
                        <Search className=\&quot;absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500\&quot; />
                        <input
                          value={searchQuery}
                          onChange={(e) =>
                            void handleSearch(e.target.value)
                          }
                          placeholder=\&quot;搜索 skills.sh 上的技能...\&quot;
                          className={`${FIELD_MONO_INPUT_CLASS} pl-9`}
                        />
                      </div>
                      {loadingSearch && (
                        <Loader2 className=\&quot;h-4 w-4 animate-spin text-gray-400\&quot; />
                      )}
                    </div>

                    {searchDuration !== null && (
                      <p className=\&quot;text-[11px] text-gray-500\&quot;>
                        {searchResults.length} 个结果 ({searchDuration}ms)
                      </p>
                    )}

                    {!loadingSearch && searchResults.length > 0 && (
                      <div className=\&quot;grid max-h-[400px] grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-gray-800 bg-black/10 px-3 py-2 sm:grid-cols-2 xl:grid-cols-3\&quot;>
                        {searchResults.map((skill) => (
                          <div
                            key={skill.id}
                            className=\&quot;flex flex-col justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2\&quot;
                          >
                            <div className=\&quot;min-w-0\&quot;>
                              <div className=\&quot;flex items-center gap-1.5\&quot;>
                                <span className=\&quot;truncate text-xs font-medium text-gray-100\&quot;>
                                  {skill.name}
                                </span>
                                <span className=\&quot;shrink-0 rounded-full border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[10px] text-gray-400\&quot;>
                                  {formatInstalls(skill.installs)} installs
                                </span>
                              </div>
                              <p className=\&quot;mt-1 truncate text-[10px] text-gray-500\&quot;>
                                {skill.source}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                void handleInstallOnlineSkill(skill)
                              }
                              disabled={commandRunning}
                              className=\&quot;inline-flex w-full items-center justify-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 py-1 text-[10px] text-indigo-200 transition-colors hover:border-indigo-400/50 hover:text-indigo-100 disabled:cursor-not-allowed disabled:opacity-40\&quot;
                            >
                              <Upload className=\&quot;h-3 w-3\&quot; />
                              安装
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {!loadingSearch &&
                      searchQuery.trim() !== &quot;&quot; &&
                      searchResults.length === 0 && (
                        <p className=\&quot;text-xs text-gray-500\&quot;>未找到匹配的技能</p>
                      )}

                    {!loadingSearch && searchQuery.trim() === &quot;&quot; && (
                      <p className=\&quot;text-xs text-gray-500\&quot;>
                        输入关键词搜索 skills.sh 上的所有技能
                      </p>
                    )}
                  </div>
                )}
&quot;;

content = content.replace(oldSearchPanel, '');

// Write new search panel
const newSearchPanel = `                {/* Search mode */}
                {installMode === 'search' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                        <input
                          value={searchQuery}
                          onChange={(e) => void handleSearch(e.target.value)}
                          placeholder="搜索 skills.sh 上的技能..."
                          className={\`\${FIELD_MONO_INPUT_CLASS} pl-9\`}
                        />
                      </div>
                      {loadingSearch && (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      )}
                    </div>

                    {searchDuration !== null && (
                      <p className="text-xs text-gray-500">
                        {searchResults.length} 个结果 ({searchDuration}ms)
                      </p>
                    )}

                    {!loadingSearch && searched && searchResults.length > 0 && (
                      <div className="grid max-h-[600px] grid-cols-1 gap-3 overflow-y-auto rounded-xl px-1">
                        {searchResults.map((skill) => (
                          <div
                            key={skill.id}
                            className="flex items-start justify-between gap-3 rounded-xl border border-gray-800 bg-black/10 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-gray-100">
                                  {skill.name}
                                </span>
                                <span className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] text-gray-400">
                                  {formatInstalls(skill.installs)} installs
                                </span>
                                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200">
                                  {skill.source}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-xs text-gray-500">
                                来源仓库：{skill.source}
                              </p>
                            </div>
                            <button
                              onClick={() => void handleInstallOnlineSkill(skill)}
                              disabled={commandRunning}
                              className="shrink-0 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200 transition-colors hover:border-indigo-400/50 hover:text-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {commandRunning ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Upload className="h-3 w-3" />
                              )}
                              安装
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {!loadingSearch && searched && searchResults.length === 0 && (
                      <p className="text-xs text-gray-500">未找到匹配的技能</p>
                    )}

                    {!loadingSearch && !searched && (
                      <p className="text-xs text-gray-500">
                        输入关键词搜索 skills.sh 上的所有技能
                      </p>
                    )}
                  </div>
                )}
`;

// Find the insert point - after the closing of the github panel in install mode
const githubPanelEnd = &quot;                {installMode === 'github' && (&quot;;
const insertPoint = content.indexOf(githubPanelEnd);
// Find the closing of the search mode panel (old version) and replace
const searchModeStart = content.indexOf(&quot;                {/* Search mode */}&quot;);
const searchModeEnd = content.indexOf(&quot;installMode === 'update'&quot;);
if (searchModeStart !== -1 && searchModeEnd !== -1) {
  content = content.substring(0, searchModeStart) + newSearchPanel + &quot;\n\n&quot; + content.substring(searchModeEnd);
}

fs.writeFileSync('src/components/SkillsPage.tsx', content);
console.log('Done');
