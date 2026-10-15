import { useLocalSearchParams } from 'expo-router';
import { ProductFormScreen } from '@/features/inventory/inventory-screens';
export default function Screen(){const p=useLocalSearchParams<{edit?:string}>();return <ProductFormScreen edit={p.edit==='1'}/>;}
