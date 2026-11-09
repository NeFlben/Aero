import { Detail } from "@/components/Detail";
export const metadata = { title: "Model" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Detail id={id} />;
}
