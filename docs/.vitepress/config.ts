import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ACU 可视化表格',
  description: '黑科技通用表格前端使用教程',

  // GitHub Pages 部署配置（根据你的仓库名调整）
  base: '/ACU_Visualizer_zaria.github.io/',

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: '指南', link: '/guide/introduction' },
      { text: '教程', link: '/tutorial/data-table' },
      { text: '参考', link: '/reference/faq' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '开始使用',
          items: [
            { text: '介绍', link: '/guide/introduction' },
            { text: '安装', link: '/guide/installation' },
            { text: '快速开始', link: '/guide/quick-start' },
          ],
        },
      ],
      '/tutorial/': [
        {
          text: '功能教程',
          items: [
            { text: '数据表格', link: '/tutorial/data-table' },
            { text: '仪表盘', link: '/tutorial/dashboard' },
            { text: '关系图', link: '/tutorial/relationship-graph' },
            { text: '标签管理', link: '/tutorial/tag-manager' },
            { text: '抽签系统', link: '/tutorial/divination' },
            { text: '主题自定义', link: '/tutorial/theme-customization' },
          ],
        },
      ],
      '/reference/': [
        {
          text: '参考',
          items: [
            { text: '常见问题', link: '/reference/faq' },
            { text: '更新日志', link: '/reference/changelog' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Zaria773/ACU_Visualizer_zaria.github.io' },
    ],

    footer: {
      message: 'ACU 可视化表格',
      copyright: 'MIT License',
    },

    search: {
      provider: 'local',
    },

    outline: {
      label: '本页目录',
      level: [2, 3],
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    lastUpdated: {
      text: '最后更新',
    },

    editLink: {
      pattern: 'https://github.com/Zaria773/ACU_Visualizer_zaria.github.io/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },
  },
})
