import { View,Text } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
const blank=JSON.stringify({version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#e9eef2'}}]});
export function NativeTerritoryMap({center,data}:{center:[number,number];data:object}){
 return <View>
  <MapLibreGL.MapView style={{height:340}} mapStyle={process.env.EXPO_PUBLIC_MAP_STYLE_URL||blank} logoEnabled={false}>
   <MapLibreGL.Camera centerCoordinate={center} zoomLevel={11}/>
   <MapLibreGL.ShapeSource id="territory" shape={data as never}>
    <MapLibreGL.FillLayer id="territory-fill" filter={['==',['geometry-type'],'Polygon']}
     style={{fillColor:['case',['==',['get','historical'],true],'#6366f1',['match',['get','classification'],'low','#65a30d','medium','#eab308','high','#f97316','very_high','#dc2626','#64748b']],fillOpacity:.3}}/>
    <MapLibreGL.LineLayer id="territory-lines" filter={['==',['geometry-type'],'LineString']} style={{lineColor:'#0284c7',lineWidth:2}}/>
    <MapLibreGL.LineLayer id="historical-sector-outlines" filter={['==',['get','historical'],true]}
     style={{lineColor:'#4338ca',lineWidth:2,lineDasharray:[2,2]}}/>
    <MapLibreGL.CircleLayer id="territory-points" filter={['==',['geometry-type'],'Point']} style={{circleColor:'#0f766e',circleRadius:6,circleStrokeColor:'#fff',circleStrokeWidth:2}}/>
   </MapLibreGL.ShapeSource>
  </MapLibreGL.MapView>
  <Text style={{fontSize:12,color:'#526475'}}>O contorno tracejado azul indica um setor de levantamento histórico.</Text>
 </View>;
}
