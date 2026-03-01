import { BoardShell } from "@/components/boards/board-shell";

type BoardPageProps = {
  params: Promise<{ boardId: string }>;
};

export default async function BoardPage({ params }: BoardPageProps) {
  const { boardId } = await params;
  return <BoardShell boardId={boardId} />;
}
