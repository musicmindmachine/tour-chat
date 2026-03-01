import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { api } from "@awn/convex/convex/api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";

export function BoardFeed() {
  const convexApi = api as any;
  const boards = useQuery(convexApi.boards.list);
  const viewer = useQuery(convexApi.users.current);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const createPost = useMutation(convexApi.posts.create);

  const activeBoardId = selectedBoardId ?? boards?.[0]?._id;

  const paginated = usePaginatedQuery(
    convexApi.posts.listByBoard,
    activeBoardId
      ? {
          boardId: activeBoardId as any,
        }
      : "skip",
    { initialNumItems: 30 },
  );

  const messages = useMemo(() => [...paginated.results].reverse(), [paginated.results]);

  if (boards === undefined || viewer === undefined) {
    return <Text style={styles.muted}>Loading…</Text>;
  }

  if (!viewer) {
    return <Text style={styles.muted}>Authenticate with WorkOS in mobile before using the feed.</Text>;
  }

  if (viewer.status !== "active") {
    return <Text style={styles.muted}>Your account is pending admin approval.</Text>;
  }

  if (!activeBoardId) {
    return <Text style={styles.muted}>No boards available.</Text>;
  }

  return (
    <View style={styles.container}>
      <Card>
        <Text style={styles.title}>Boards</Text>
        <View style={styles.row}>
          {boards.map((board: any) => (
            <Button
              key={board._id}
              label={board.name}
              variant={board._id === activeBoardId ? "default" : "outline"}
              onPress={() => setSelectedBoardId(board._id as string)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.title}>Messages</Text>
        <FlatList
          data={messages}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.messageCard}>
              <Text style={styles.messageMeta}>{new Date(item._creationTime).toLocaleString()}</Text>
              <Text style={styles.messageBody}>{item.body}</Text>
            </View>
          )}
          onEndReached={() => {
            if (paginated.status === "CanLoadMore") {
              void paginated.loadMore(30);
            }
          }}
        />
      </Card>

      <Card>
        <Text style={styles.title}>New message</Text>
        <Input
          value={body}
          onChangeText={setBody}
          placeholder="Type message (mentions like @username)"
          multiline
          numberOfLines={3}
          style={[styles.inputMultiline]}
        />
        <Button
          label="Send"
          onPress={() => {
            if (!body.trim()) {
              return;
            }
            void createPost({
              boardId: activeBoardId as any,
              body,
              attachmentKeys: [],
            });
            setBody("");
          }}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    padding: 12,
    backgroundColor: "#f8fafc",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  muted: {
    color: "#64748b",
    fontSize: 14,
    padding: 16,
  },
  messageCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    marginBottom: 8,
    padding: 10,
    gap: 4,
  },
  messageMeta: {
    color: "#64748b",
    fontSize: 12,
  },
  messageBody: {
    color: "#0f172a",
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
});
