import { Skeleton } from "@/components/ui/feedback";

export default function Loading() {
  return (
    <div className="container-rr py-10" role="status" aria-label="Loading">
      <Skeleton className="mb-6 h-10 w-64" />
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[4/5] w-full" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/3" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
