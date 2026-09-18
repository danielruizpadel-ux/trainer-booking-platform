/**
 * Home page - redirects to trainer web or admin
 */

import { redirect } from 'next/navigation'

export default function Home() {
  // Redirect to trainer web portal
  redirect('/web')
}
