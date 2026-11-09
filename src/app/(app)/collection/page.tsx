import { Suspense } from "react";
import { CollectionView } from "@/components/CollectionView";
export const metadata = { title: "My Collection" };
export default function Page() {
  return (
    <Suspense>
      <CollectionView />
    </Suspense>
  );
}
