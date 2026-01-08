// Where: Next.js app entry page.
// What: Redirects to the memories page.
// Why: The dashboard page is removed in favor of memories as the landing route.
import { redirect } from 'next/navigation'

const HomePage = () => {
  redirect('/memories')
}

export default HomePage
