import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';

export const metadata:Metadata={
  title:'Zuri Holidays — Travel Business Management',
  description:'Local travel agency CRM and interactive demonstration workspace by Infinex Loop.',
};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
