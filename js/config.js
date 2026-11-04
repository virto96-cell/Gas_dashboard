/* Конфигурация дашборда. Меняйте имена файлов, цвета и параметры GeoJSON здесь — код трогать не нужно. */
window.CONFIG = {
  // Папка и имена CSV-файлов (замена файлов без изменения кода: положите новые файлы с теми же колонками)
  dataDir: 'data/',
  files: {
    exportFlows: 'export_flows.csv',
    lngExports: 'lng_exports.csv',
    consumption: 'domestic_consumption.csv',
    production: 'domestic_production.csv',
    europe: 'europe_market.csv',
    china: 'china_market.csv',
    centralAsia: 'central_asia_exports.csv',
    centralAsiaMarket: 'central_asia_market.csv',
    contracts: 'contracts.csv',
    prices: 'prices_annual.csv'
  },

  // GeoJSON субъектов РФ.
  // nameProperty — свойство Feature.properties с названием региона (должно совпадать с колонкой `region` в domestic_consumption.csv)
  // shortProperty — необязательное короткое имя для подписи на плитке (если свойства нет, подписи не выводятся)
  geo: {
    url: 'data/geo/russia_regions.geojson',
    nameProperty: 'name',
    shortProperty: 'short',
    showLabels: false
  },

  // ЦВЕТА КАРТЫ (choropleth): от меньшего потребления к большему
  mapColors: ['#eaf2fb', '#bcd5ee', '#82b0dc', '#4a86c2', '#1f5fa8', '#0f3a6e'],
  mapBorder: '#ffffff',
  mapSelectedBorder: '#d9382b',   // обводка выбранного региона
  mapNoData: '#e6e9ee',

  // Цвета рядов
  colors: {
    companies: { 'Газпром': '#1f5fa8', 'Роснефть': '#d9822b', 'Новатэк': '#2a9d8f', 'Прочие': '#8a94a6' },
    west: '#1f5fa8', east: '#c8402f', south: '#2a9d8f', lng: '#7a4fb0',
    pipe: '#1f5fa8', lngSeries: '#7a4fb0', share: '#c8402f', cons: '#18212f',
    sectors: { 'Электроэнергетика': '#1f5fa8', 'Промышленность': '#d9822b', 'Население и услуги': '#2a9d8f', 'Прочее': '#8a94a6' },
    ownProd: '#2a9d8f',
    countries: { 'Узбекистан': '#1f5fa8', 'Казахстан': '#d9822b', 'Киргизия': '#2a9d8f' },
    segments: {
      'трубопроводный_Европа': '#1f5fa8', 'трубопроводный_Китай': '#c8402f',
      'СПГ_Европа': '#7a4fb0', 'СПГ_Азия': '#d9822b'
    }
  },

  companies: ['Газпром', 'Роснефть', 'Новатэк', 'Прочие'],
  segmentLabels: {
    'трубопроводный_Европа': 'Трубопроводный газ — Европа',
    'трубопроводный_Китай': 'Трубопроводный газ — Китай',
    'СПГ_Европа': 'СПГ — Европа',
    'СПГ_Азия': 'СПГ — Азия'
  },
  // Подписи маршрутов на схеме потоков
  directionLabels: { west: 'Запад · «Турецкий поток»', east: 'Восток · «Сила Сибири»', south: 'Юг · Средняя Азия' },
  forecastLabel: 'прогноз'
};
