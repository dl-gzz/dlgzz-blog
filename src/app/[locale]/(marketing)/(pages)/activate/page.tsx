import { redirect } from 'next/navigation';

/** 购买页面/客服消息里更容易记住的短链接，统一指向 OneWorkerOS 授权页。 */
export default function ActivateAliasPage() {
  redirect('/onework');
}
