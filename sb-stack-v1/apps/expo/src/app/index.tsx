import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, Stack } from "expo-router";
import { LegendList } from "@legendapp/list/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "~/utils/api";
import { authClient } from "~/utils/auth";

type Post = NonNullable<
  Awaited<ReturnType<typeof api.api.posts.get>>["data"]
>[number];

function PostCard(props: { post: Post; onDelete: () => void }) {
  return (
    <View className="bg-muted flex flex-row rounded-lg p-4">
      <View className="grow">
        <Link
          asChild
          href={{
            pathname: "/post/[id]",
            params: { id: props.post.id },
          }}
        >
          <Pressable className="">
            <Text className="text-primary text-xl font-semibold">
              {props.post.title}
            </Text>
            <Text className="text-foreground mt-2">{props.post.content}</Text>
          </Pressable>
        </Link>
      </View>
      <Pressable onPress={props.onDelete}>
        <Text className="text-primary font-bold uppercase">Delete</Text>
      </Pressable>
    </View>
  );
}

function CreatePost() {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { mutate, error } = useMutation({
    mutationFn: async (input: { title: string; content: string }) => {
      const res = await api.api.posts.post(input);
      if (res.error) {
        throw new Error(
          res.error.status === 401
            ? "You need to be logged in to create a post"
            : `Creating the post failed (${res.error.status})`,
        );
      }
      return res.data;
    },
    async onSuccess() {
      setTitle("");
      setContent("");
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  return (
    <View className="mt-4 flex gap-2">
      <TextInput
        className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
      />
      <TextInput
        className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
        value={content}
        onChangeText={setContent}
        placeholder="Content"
      />
      <Pressable
        className="bg-primary flex items-center rounded-sm p-2"
        onPress={() => {
          mutate({
            title,
            content,
          });
        }}
      >
        <Text className="text-foreground">Create</Text>
      </Pressable>
      {error && <Text className="text-destructive mt-2">{error.message}</Text>}
    </View>
  );
}

function MobileAuth() {
  const { data: session } = authClient.useSession();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const { error: authError } =
      mode === "signup"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
    if (authError) {
      // better-auth types `message` as optional; surface a fallback if absent.
      setError(authError.message ?? "Authentication failed");
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setMode("signin");
    setError(null);
  };

  if (session) {
    return (
      <>
        <Text className="text-foreground pb-2 text-center text-xl font-semibold">
          {session.user.name ? `Hello, ${session.user.name}` : "Not logged in"}
        </Text>
        <Pressable
          onPress={() => void authClient.signOut()}
          className="bg-primary flex items-center rounded-sm p-2"
        >
          <Text className="text-foreground">Sign Out</Text>
        </Pressable>
      </>
    );
  }

  return (
    <View className="flex gap-2">
      <Text className="text-foreground pb-2 text-center text-xl font-semibold">
        Not logged in
      </Text>
      {mode === "signup" && (
        <TextInput
          className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
          value={name}
          onChangeText={setName}
          placeholder="Name"
          autoCapitalize="none"
        />
      )}
      <TextInput
        className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        autoCapitalize="none"
      />
      {error && <Text className="text-destructive mt-2">{error}</Text>}
      <Pressable
        onPress={() => void submit()}
        className="bg-primary flex items-center rounded-sm p-2"
      >
        <Text className="text-foreground">
          {mode === "signup" ? "Sign up" : "Sign in"}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setError(null);
          setMode(mode === "signup" ? "signin" : "signup");
        }}
        className="flex items-center rounded-sm p-2"
      >
        <Text className="text-foreground">
          {mode === "signup"
            ? "Have an account? Sign in"
            : "Need an account? Sign up"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function Index() {
  const queryClient = useQueryClient();

  const postQuery = useQuery({
    queryKey: ["posts"],
    queryFn: () => api.api.posts.get().then((r) => r.data),
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.posts({ id }).delete();
      if (res.error) {
        throw new Error(`Deleting the post failed (${res.error.status})`);
      }
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });

  return (
    <SafeAreaView className="bg-background">
      {/* Changes page title visible on the header */}
      <Stack.Screen options={{ title: "Home Page" }} />
      <View className="bg-background h-full w-full p-4">
        <Text className="text-foreground pb-2 text-center text-5xl font-bold">
          Create <Text className="text-primary">T3</Text> Turbo
        </Text>

        <MobileAuth />

        <View className="py-2">
          <Text className="text-primary font-semibold italic">
            Press on a post
          </Text>
        </View>

        <LegendList
          data={postQuery.data ?? []}
          estimatedItemSize={20}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={(p) => (
            <PostCard
              post={p.item}
              onDelete={() => deletePostMutation.mutate(p.item.id)}
            />
          )}
        />

        <CreatePost />
      </View>
    </SafeAreaView>
  );
}
