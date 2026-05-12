/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // ────────────────────────────────────────────
      // Semantic tokens — 最小改动方案
      // 不替换现有色值，仅新增语义化别名
      // ────────────────────────────────────────────
      colors: {
        // Surface 层级（背景）
        surface: {
          base:    '#0b0f14',  // gray-950
          card:    '#111827',  // gray-900
          muted:   'rgba(17,24,39,.8)',  // gray-900/80
          subtle:  'rgba(17,24,39,.6)',  // gray-900/60
        },
        // Border 层级
        border: {
          default: '#1f2937',  // gray-800
          subtle:  'rgba(31,41,55,.5)', // gray-800/50
          hover:   '#374151',  // gray-700
          accent:  'rgba(99,102,241,.5)', // indigo-500/50
          danger:  'rgba(239,68,68,.5)',  // red-500/50
        },
        // Text 层级
        text: {
          heading:   '#f3f4f6',  // gray-100
          body:      '#d1d5db',  // gray-300
          muted:     '#9ca3af',  // gray-400
          subtle:    '#6b7280',  // gray-500
          disabled:  '#4b5563',  // gray-600
          accent:    '#a5b4fc',  // indigo-300
          success:   '#34d399',  // emerald-400
          warning:   '#fbbf24',  // amber-400
          error:     '#f87171',  // red-400
        },
      },
    },
  },
  plugins: [],
}
