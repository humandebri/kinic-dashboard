import { CompassIcon } from 'lucide-react'
import { Link } from 'react-router'

import EmptyState from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'

const NotFoundPage = () => {
  return (
    <EmptyState
      className='mt-10'
      icon={<CompassIcon />}
      title='Page not found'
      description='The page you are looking for does not exist.'
      action={
        <Button asChild variant='outline'>
          <Link to='/memories'>Back to memories</Link>
        </Button>
      }
    />
  )
}

export default NotFoundPage
