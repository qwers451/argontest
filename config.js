/*
 * Конфигурация сравнения.
 *
 * Сайты лежат в папке sites/ под нейтральными именами, чтобы URL
 * не подсказывал, какая модель что сделала. Чтобы добавить версию —
 * положите html в sites/ и пропишите путь в нужном раунде.
 * Пока версии нет (null), вместо неё показывается заглушка.
 */
window.COMPARE = {
  title: 'Claude vs Argon',

  // Модель, которую нужно угадать в слепом тесте.
  guess: 'claude',

  models: {
    claude: { name: 'Claude Opus 5.5', short: 'Claude', color: '#e5835e' },
    argon:  { name: 'Argon 4',         short: 'Argon',  color: '#a99cff' },
  },

  // Один раунд — один промпт: обе модели сделали по сайту.
  rounds: [
    {
      id: 'bathyscaphe',
      title: 'Батискаф',
      sites: { claude: 'sites/x1.html', argon: 'sites/k2m9.html' },
    },
    {
      id: 'watch',
      title: 'Часовой калибр',
      sites: { claude: null, argon: 'sites/x7qd.html' },
    },
  ],
};
