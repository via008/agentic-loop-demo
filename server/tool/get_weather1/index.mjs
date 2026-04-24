import { z } from 'zod';
import { resolveLocation } from '../../llm/resolve_location/index.mjs';

const weatherToolSchema = z.object({
  city: z.string(),
  date: z.string(),
});

const weatherCodeMap = {
  0: '晴',
  1: '大部晴朗',
  2: '局部多云',
  3: '阴',
  45: '有雾',
  48: '冻雾',
  51: '小毛雨',
  53: '毛雨',
  55: '强毛雨',
  56: '冻毛雨',
  57: '强冻毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '阵雨',
  81: '强阵雨',
  82: '暴雨',
  85: '阵雪',
  86: '强阵雪',
  95: '雷暴',
  96: '雷暴伴小冰雹',
  99: '雷暴伴大冰雹',
};

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isIsoDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function createDateFromIsoString(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function resolveTargetDate(label) {
  if (isIsoDateString(label)) {
    return createDateFromIsoString(label);
  }

  const today = new Date();
  const normalizedLabel = label.trim();

  if (normalizedLabel === '今天') {
    return today;
  }

  if (normalizedLabel === '明天') {
    return addDays(today, 1);
  }

  if (normalizedLabel === '后天') {
    return addDays(today, 2);
  }

  if (normalizedLabel === '本周六' || normalizedLabel === '周末') {
    const day = today.getDay();
    const distance = (6 - day + 7) % 7;
    return addDays(today, distance);
  }

  if (normalizedLabel === '本周日') {
    const day = today.getDay();
    const distance = (7 - day + 7) % 7;
    return addDays(today, distance === 7 ? 0 : distance);
  }

  return addDays(today, 1);
}

export async function getWeather1(input, options) {
  const { city, date } = weatherToolSchema.parse(input);

  const location = await resolveLocation(city, options);
  const targetDate = isIsoDateString(date)
    ? date
    : formatDate(resolveTargetDate(date));
  const forecastUrl = `https://api.open-meteo.com?latitude=${location.latitude}&longitude=${location.longitude}&daily=weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max&timezone=${encodeURIComponent(location.timezone)}&start_date=${targetDate}&end_date=${targetDate}`;

  console.log({
    city: city,
    location: location,
    resolvedDate: targetDate,
  });

  const response = await fetch(forecastUrl);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`天气查询失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const daily = data.daily;

  if (
    !daily ||
    !Array.isArray(daily.time) ||
    daily.time.length === 0 ||
    !Array.isArray(daily.weather_code) ||
    !Array.isArray(daily.temperature_2m_min) ||
    !Array.isArray(daily.temperature_2m_max) ||
    !Array.isArray(daily.precipitation_probability_max) ||
    !Array.isArray(daily.wind_speed_10m_max)
  ) {
    throw new Error('天气服务返回的数据结构不完整。');
  }

  const weatherCode = Number(daily.weather_code[0]);
  const condition = weatherCodeMap[weatherCode] ?? '未知天气';
  const temperatureMinC = Math.round(Number(daily.temperature_2m_min[0]));
  const temperatureMaxC = Math.round(Number(daily.temperature_2m_max[0]));
  const rainProbability = Math.round(
    Number(daily.precipitation_probability_max[0]),
  );
  const windSpeed = Math.round(Number(daily.wind_speed_10m_max[0]));

  return {
    city: location.name,
    date,
    condition,
    temperatureMinC,
    temperatureMaxC,
    rainProbability,
    windLevel: `${windSpeed} km/h`,
  };
}
