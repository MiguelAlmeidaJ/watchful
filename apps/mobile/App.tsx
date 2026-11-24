import { View, Text, StyleSheet } from 'react-native';
import { Shield } from 'lucide-react-native';
export default function App() { return <View style={styles.screen}><Shield size={48} color="#0f766e"/><Text style={styles.title}>Watchful</Text><Text>Monitoramento e prevenção</Text><Text>Dados ainda não disponíveis.</Text></View>; }
const styles = StyleSheet.create({screen:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:'#f4f7fa'},title:{fontSize:32,fontWeight:'700',color:'#142638'}});
