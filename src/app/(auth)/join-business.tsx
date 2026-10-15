import { router } from 'expo-router';
import { Building2, Users } from 'lucide-react-native';
import { AppText, Card, Page, PrimaryButton } from '@/components/ui/primitives';
import { colors } from '@/constants/theme';

export default function JoinBusinessScreen() {
  return <Page title="Join a business" subtitle="Shared shop access is not available yet." back>
    <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 26 }}>
      <Building2 size={32} stroke={colors.deepPurple}/>
      <AppText variant="heading">Business invitations are not set up</AppText>
      <AppText color={colors.secondary} style={{ textAlign: 'center' }}>The current account model gives each login its own shop data. Joining another owner’s shop needs shared membership records and matching cloud permissions, so this screen cannot accept an invite yet.</AppText>
    </Card>
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Users size={20} stroke={colors.deepPurple}/>
      <AppText variant="small" color={colors.secondary} style={{ flex: 1 }}>The owner can add seller profiles on their device to attribute sales. Those profiles do not provide separate sign-ins or shared access.</AppText>
    </Card>
    <PrimaryButton label="Return to log in" onPress={()=>router.replace('/(auth)/login')}/>
  </Page>;
}
