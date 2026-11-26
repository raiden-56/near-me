import { MapPinOff } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { CATEGORY_BY_ID } from '@/data/categories';
import { usePlace } from '@/hooks/usePlaces';
import { ReviewsSection } from '../components/ReviewsSection';

/** Every review for one place, on its own page. */
export default function ReviewsPage() {
  const { id } = useParams();
  const { place, isLoading, isError, error, refetch } = usePlace(id);

  if (isLoading)
    return (
      <Page>
        <Skeleton className="mt-8 h-9 w-1/2" />
        <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
      </Page>
    );
  if (isError) return <Page><ErrorState error={error} onRetry={() => void refetch()} /></Page>;
  if (!place)
    return (
      <Page>
        <EmptyState icon={MapPinOff} title="Place not found" action={<Button asChild><Link to="/">Back to Discover</Link></Button>} />
      </Page>
    );

  return (
    <Page className="max-w-[820px]">
      <PageHeader eyebrow={CATEGORY_BY_ID[place.categoryId]?.singular} title={place.name} subtitle="What people say about this place" back={`/place/${place.id}`} />
      <ReviewsSection place={place} />
    </Page>
  );
}
