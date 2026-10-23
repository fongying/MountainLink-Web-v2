"""Convert verified official SHP archives to WGS84 GeoJSON. pip: pyshp pyproj shapely."""
import sys, pathlib, zipfile, json, hashlib, datetime, urllib.request
sys.path.insert(0, str(pathlib.Path('.tools/geo').resolve()))
import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform
root = pathlib.Path('data/geohazards')
features, sources = [], []
if '--download' in sys.argv:
    (root / 'source').mkdir(parents=True, exist_ok=True)
    for kind, rid, source_id in [('potential','66656','J74'),('impact','66657','J75')]:
        url=f'https://data.moa.gov.tw/OpenData/GetOpenDataFile.aspx?FileType=SHP&RID={rid}&id={source_id}'
        with urllib.request.urlopen(url, timeout=90) as response:
            content=response.read()
        if not zipfile.is_zipfile(__import__('io').BytesIO(content)): raise ValueError('Expected ZIP download')
        (root / 'source' / f'landslide-{kind}.zip').write_bytes(content)

for kind, dataset in [('potential','176527'), ('impact','176528')]:
    archive = root / 'source' / f'landslide-{kind}.zip'
    target = root / 'source' / kind
    with zipfile.ZipFile(archive) as z:
        z.extractall(target)
    shp = next(target.rglob('*.shp'))
    crs = CRS.from_wkt(shp.with_suffix('.prj').read_text(encoding='utf-8-sig'))
    print(kind, crs.to_string())
    project = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True).transform
    reader = shapefile.Reader(str(shp), encoding='utf-8')
    count = 0
    selected = [f.name for f in reader.fields[1:] if f.name.lower() in ['lslno','islno','name','county01','county','town01','town','vill01','vill','risk']]
    for sr in reader.iterShapeRecords(fields=selected):
        props = {k.lower():v for k,v in sr.record.as_dict().items()}
        geom = transform(project, shape(sr.shape.__geo_interface__))
        if not geom.is_valid or geom.is_empty: raise ValueError('Invalid official geometry')
        if not (118 < geom.bounds[0] < geom.bounds[2] < 123 and 21 < geom.bounds[1] < geom.bounds[3] < 26): raise ValueError('Unexpected Taiwan bounds')
        fid = str(props.get('lslno') or props.get('islno') or '')
        if not fid: raise ValueError('Missing official ID')
        features.append({'type':'Feature','id':f'{kind}:{fid}:{count}', 'geometry':mapping(geom), 'properties':{
            'officialId':fid, 'kind':kind, 'name':str(props.get('name') or ''),
            'county':str(props.get('county01') or props.get('county') or ''),
            'town':str(props.get('town01') or props.get('town') or ''),
            'village':str(props.get('vill01') or props.get('vill') or ''),
            'risk':str(props.get('risk') or ''), 'dataset':dataset, 'year':115
        }})
        count += 1
    sources.append({'kind':kind,'url':f'https://data.gov.tw/dataset/{dataset}','count':count,'crs':crs.to_string(),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()})
    print(kind, count)
if any(s['count'] != 94 for s in sources): raise ValueError('Expected 94 features per official dataset; review new release before replacing')
output = {'type':'FeatureCollection','metadata':{'year':115,'source':'農業部農村發展及水土保持署','license':'政府資料開放授權條款-第1版','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sources':sources},'features':features}
path = root / 'landslides-115.geojson'
path.with_suffix('.tmp').write_text(json.dumps(output, ensure_ascii=False, separators=(',',':')),encoding='utf-8')
path.with_suffix('.tmp').replace(path)
print(path, path.stat().st_size)

