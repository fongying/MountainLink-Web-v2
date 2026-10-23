import type { GeoDataset } from '$lib/geohazards';
// Installed independently of alert layers so existing CWA styling remains unchanged.
export function installGeohazardControls(map:any, initialVisible=false) {
  let visible=initialVisible;
  let disposed=false, dataset:GeoDataset|null=null;
  const host=document.createElement('div');
  host.style.cssText='background:#07151b;color:#dce9ee;padding:10px;margin:8px;border:1px solid #526477;border-radius:8px;max-width:270px;font:13px sans-serif';
  host.style.display=visible?'':'none';
  const title=document.createElement('div'); title.textContent='崩塌圖資'; host.append(title);
  const layers:any[]=[];
  const listeners:any[]=[];
  const inputs:HTMLInputElement[]=[];
  const popups:google.maps.InfoWindow[]=[];
  for(const [kind,label,color] of [['potential','崩塌潛勢區','#b366ff'],['impact','崩塌影響範圍','#ffab40']]) {
    const row=document.createElement('label');row.style.cssText='display:block;margin-top:8px;cursor:pointer';
    const input=document.createElement('input');input.type='checkbox';inputs.push(input);
    row.append(input,document.createTextNode(` ${label}`));host.append(row);
    const layer=new google.maps.Data(); layers.push(layer);
    layer.setStyle({fillColor:color,strokeColor:color,fillOpacity:0.2,strokeWeight:2,zIndex:20,clickable:true});
    const info=new google.maps.InfoWindow(); popups.push(info);
    listeners.push(layer.addListener('click',(event:any)=>{
      const f=event.feature, content=document.createElement('div');content.style.cssText='color:#dce9ee;background:#07151b;padding:12px;border-radius:8px;max-width:280px;line-height:1.6';
      const text=document.createElement('div');text.textContent=`${label} ${f.getProperty('officialId')} ${f.getProperty('county')}${f.getProperty('town')}。115 年版；潛勢不代表災害正在發生。`;
      const link=document.createElement('a');link.href=`https://data.gov.tw/dataset/${f.getProperty('dataset')}`;link.target='_blank';link.rel='noreferrer';link.style.color='#79cfff';link.textContent='官方資料來源';content.append(text,link);
      info.setContent(content);info.setPosition(event.latLng);info.open({map});
    }));
    input.onchange=async()=>{
      input.disabled=true;
      try {
        if(!dataset){const response=await fetch('/api/geohazards');if(!response.ok) throw Error();dataset=await response.json();}
        if(disposed) return;
        const features=dataset!.features.filter(f=>f.properties.kind===kind);
        if(features.length && !layer.getFeatureById(features[0].id)) layer.addGeoJson({...dataset,features});
        layer.setMap(visible && input.checked?map:null); title.textContent='崩塌圖資';
      } catch {input.checked=false;title.textContent='圖資載入失敗，請重新勾選';}
      finally {input.disabled=false;}
    };
    listeners.push({remove:()=>info.close()});
  }
  const controls=map.controls[google.maps.ControlPosition.TOP_LEFT];controls.push(host);
  const destroy=()=>{disposed=true;for(const input of inputs)input.onchange=null;for(const layer of layers)layer.setMap(null);for(const l of listeners)l.remove();for(let i=controls.getLength()-1;i>=0;i--)if(controls.getAt(i)===host)controls.removeAt(i);};
  return Object.assign(destroy, {setVisible(next:boolean) {
    if(disposed) return;
    visible=next; host.style.display=visible?'':'none';
    layers.forEach((layer,index)=>layer.setMap(visible && inputs[index].checked?map:null));
    if(!visible) popups.forEach(info=>info.close());
  }});
}


