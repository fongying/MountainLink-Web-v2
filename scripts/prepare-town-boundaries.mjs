import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_INPUT = '.tmp-town-boundaries/TOWN_MOI_1140318';
const DEFAULT_OUTPUT = 'static/data/mountain-town-boundaries.geojson';

const inputBase = process.argv[2] ?? DEFAULT_INPUT;
const outputFile = process.argv[3] ?? DEFAULT_OUTPUT;

const MOUNTAIN_AREAS = new Set([
  '宜蘭縣大同鄉',
  '宜蘭縣南澳鄉',
  '桃園市復興區',
  '新北市烏來區',
  '新北市坪林區',
  '新北市石碇區',
  '新北市平溪區',
  '新北市雙溪區',
  '新竹縣五峰鄉',
  '新竹縣尖石鄉',
  '新竹縣橫山鄉',
  '新竹縣關西鎮',
  '苗栗縣泰安鄉',
  '苗栗縣南庄鄉',
  '苗栗縣獅潭鄉',
  '苗栗縣大湖鄉',
  '苗栗縣卓蘭鎮',
  '苗栗縣三義鄉',
  '臺中市和平區',
  '臺中市新社區',
  '臺中市東勢區',
  '南投縣仁愛鄉',
  '南投縣信義鄉',
  '南投縣埔里鎮',
  '南投縣魚池鄉',
  '南投縣國姓鄉',
  '南投縣水里鄉',
  '南投縣鹿谷鄉',
  '南投縣竹山鎮',
  '南投縣中寮鄉',
  '南投縣集集鎮',
  '南投縣名間鄉',
  '嘉義縣阿里山鄉',
  '嘉義縣梅山鄉',
  '嘉義縣竹崎鄉',
  '嘉義縣番路鄉',
  '臺南市楠西區',
  '臺南市南化區',
  '臺南市玉井區',
  '高雄市桃源區',
  '高雄市那瑪夏區',
  '高雄市茂林區',
  '高雄市六龜區',
  '高雄市甲仙區',
  '高雄市杉林區',
  '高雄市美濃區',
  '屏東縣霧臺鄉',
  '屏東縣三地門鄉',
  '屏東縣瑪家鄉',
  '屏東縣泰武鄉',
  '屏東縣來義鄉',
  '屏東縣春日鄉',
  '屏東縣獅子鄉',
  '屏東縣牡丹鄉',
  '屏東縣滿州鄉',
  '花蓮縣秀林鄉',
  '花蓮縣卓溪鄉',
  '花蓮縣萬榮鄉',
  '花蓮縣瑞穗鄉',
  '花蓮縣玉里鎮',
  '花蓮縣豐濱鄉',
  '臺東縣海端鄉',
  '臺東縣延平鄉',
  '臺東縣金峰鄉',
  '臺東縣達仁鄉'
]);

function readDbf(dbfFile) {
  const buf = fs.readFileSync(dbfFile);
  const recordCount = buf.readUInt32LE(4);
  const headerLength = buf.readUInt16LE(8);
  const recordLength = buf.readUInt16LE(10);
  const fields = [];

  for (let offset = 32; offset < headerLength - 1; offset += 32) {
    const name = buf
      .slice(offset, offset + 11)
      .toString('ascii')
      .replace(/\0.*$/, '')
      .trim();
    if (!name) continue;
    fields.push({
      name,
      length: buf[offset + 16]
    });
  }

  const records = [];
  for (let i = 0; i < recordCount; i += 1) {
    const recordOffset = headerLength + i * recordLength;
    if (buf[recordOffset] === 0x2a) continue;

    const row = {};
    let fieldOffset = recordOffset + 1;
    for (const field of fields) {
      row[field.name] = buf
        .slice(fieldOffset, fieldOffset + field.length)
        .toString('utf8')
        .trim();
      fieldOffset += field.length;
    }
    records.push(row);
  }

  return records;
}

function readShp(shpFile, records) {
  const buf = fs.readFileSync(shpFile);
  const features = [];
  let offset = 100;
  let recordIndex = 0;

  while (offset + 8 <= buf.length && recordIndex < records.length) {
    const contentLengthWords = buf.readInt32BE(offset + 4);
    const contentStart = offset + 8;
    const contentBytes = contentLengthWords * 2;
    const shapeType = buf.readInt32LE(contentStart);
    const props = records[recordIndex];

    if ((shapeType === 5 || shapeType === 15 || shapeType === 25) && props) {
      const numParts = buf.readInt32LE(contentStart + 36);
      const numPoints = buf.readInt32LE(contentStart + 40);
      const partsOffset = contentStart + 44;
      const pointsOffset = partsOffset + numParts * 4;
      const partStarts = [];

      for (let i = 0; i < numParts; i += 1) {
        partStarts.push(buf.readInt32LE(partsOffset + i * 4));
      }
      partStarts.push(numPoints);

      const rings = [];
      for (let i = 0; i < numParts; i += 1) {
        const start = partStarts[i];
        const end = partStarts[i + 1];
        const ring = [];
        for (let pointIndex = start; pointIndex < end; pointIndex += 1) {
          const pointOffset = pointsOffset + pointIndex * 16;
          const lng = roundCoord(buf.readDoubleLE(pointOffset));
          const lat = roundCoord(buf.readDoubleLE(pointOffset + 8));
          ring.push([lng, lat]);
        }
        if (ring.length >= 4) rings.push(ring);
      }

      if (rings.length > 0) {
        features.push({
          type: 'Feature',
          properties: {
            county: props.COUNTYNAME,
            town: props.TOWNNAME,
            townCode: props.TOWNCODE,
            areaKey: `${props.COUNTYNAME}${props.TOWNNAME}`
          },
          geometry: {
            type: 'MultiPolygon',
            coordinates: rings.map((ring) => [simplifyRing(ring)])
          }
        });
      }
    }

    offset = contentStart + contentBytes;
    recordIndex += 1;
  }

  return features;
}

function roundCoord(value) {
  return Number(value.toFixed(6));
}

function simplifyRing(ring) {
  return ring;
}

const dbfFile = `${inputBase}.dbf`;
const shpFile = `${inputBase}.shp`;
const records = readDbf(dbfFile);
const features = readShp(shpFile, records).filter((feature) =>
  MOUNTAIN_AREAS.has(feature.properties.areaKey)
);

const geojson = {
  type: 'FeatureCollection',
  name: 'mountain-town-boundaries',
  generatedAt: new Date().toISOString(),
  source: 'MOI/NLSC TOWN_MOI_1140318',
  features
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(geojson)}\n`, 'utf8');

console.log(`Wrote ${features.length} mountain town boundaries to ${outputFile}`);
