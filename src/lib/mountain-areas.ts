export type MountainArea = {
  county: string;
  town: string;
};

const MOUNTAIN_TOWNS_BY_COUNTY: Record<string, string[]> = {
  臺北市: ['北投區', '士林區', '內湖區', '南港區', '文山區'],
  新北市: ['烏來區', '坪林區', '石碇區', '平溪區', '雙溪區', '瑞芳區', '三峽區', '新店區'],
  桃園市: ['復興區', '大溪區'],
  新竹縣: ['尖石鄉', '五峰鄉', '橫山鄉', '關西鎮', '北埔鄉', '峨眉鄉'],
  苗栗縣: ['泰安鄉', '南庄鄉', '獅潭鄉', '大湖鄉', '卓蘭鎮', '三義鄉'],
  臺中市: ['和平區', '東勢區', '新社區', '太平區', '霧峰區', '北屯區'],
  南投縣: [
    '仁愛鄉',
    '信義鄉',
    '埔里鎮',
    '魚池鄉',
    '國姓鄉',
    '水里鄉',
    '鹿谷鄉',
    '竹山鎮',
    '中寮鄉',
    '集集鎮',
    '名間鄉'
  ],
  雲林縣: ['古坑鄉', '林內鄉'],
  嘉義縣: ['阿里山鄉', '梅山鄉', '竹崎鄉', '番路鄉', '大埔鄉'],
  臺南市: ['楠西區', '南化區', '玉井區', '左鎮區', '龍崎區', '東山區', '白河區'],
  高雄市: ['桃源區', '那瑪夏區', '茂林區', '六龜區', '甲仙區', '杉林區', '美濃區', '內門區', '田寮區'],
  屏東縣: ['三地門鄉', '霧臺鄉', '瑪家鄉', '泰武鄉', '來義鄉', '春日鄉', '獅子鄉', '牡丹鄉', '滿州鄉'],
  宜蘭縣: ['大同鄉', '南澳鄉', '礁溪鄉', '員山鄉', '冬山鄉'],
  花蓮縣: ['秀林鄉', '卓溪鄉', '萬榮鄉', '鳳林鎮', '光復鄉', '瑞穗鄉', '玉里鎮', '富里鄉'],
  臺東縣: ['海端鄉', '延平鄉', '金峰鄉', '達仁鄉', '太麻里鄉', '卑南鄉', '東河鄉', '成功鎮']
};

const COUNTY_ALIASES: Record<string, string> = {
  台北市: '臺北市',
  台中市: '臺中市',
  台南市: '臺南市',
  台東縣: '臺東縣',
  台灣: '臺灣'
};

function normalizeCountyName(county: string) {
  const trimmed = county.trim();
  return COUNTY_ALIASES[trimmed] ?? trimmed;
}

function normalizeAreaName(area: string) {
  return area
    .trim()
    .replace(/\s+/g, '')
    .replace(/^台/, '臺');
}

export function splitTaiwanArea(area: string): { county: string; town?: string } | null {
  const normalized = normalizeAreaName(area);
  const match = normalized.match(/^(.+?[縣市])(.+)?$/);
  if (!match) return null;

  const county = normalizeCountyName(match[1]);
  const town = match[2]?.trim();
  return town ? { county, town } : { county };
}

export function mountainTownsForCounty(county: string) {
  return MOUNTAIN_TOWNS_BY_COUNTY[normalizeCountyName(county)]?.slice() ?? [];
}

export function isMountainArea(area: string) {
  const parsed = splitTaiwanArea(area);
  if (!parsed) return false;

  const towns = mountainTownsForCounty(parsed.county);
  if (towns.length === 0) return false;
  if (!parsed.town) return true;
  if (parsed.town === '山區') return true;
  return towns.includes(parsed.town);
}

export function toMountainAreaNames(areas: string[]) {
  const next: string[] = [];

  for (const area of areas) {
    const parsed = splitTaiwanArea(area);
    if (!parsed) continue;

    const towns = mountainTownsForCounty(parsed.county);
    if (towns.length === 0) continue;

    if (!parsed.town || parsed.town === '山區') {
      next.push(...towns.map((town) => `${parsed.county}${town}`));
      continue;
    }

    if (towns.includes(parsed.town)) {
      next.push(`${parsed.county}${parsed.town}`);
    }
  }

  return Array.from(new Set(next)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

export const MOUNTAIN_FORECAST_LOCATIONS: MountainArea[] = Object.entries(MOUNTAIN_TOWNS_BY_COUNTY).flatMap(
  ([county, towns]) => towns.map((town) => ({ county, town }))
);
