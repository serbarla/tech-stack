import { SafeAreaView, Text, View } from "react-native";
import { Stack, useGlobalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { api } from "~/utils/api";

export default function Post() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const { data, isPending, isError } = useQuery({
    queryKey: ["post", id],
    queryFn: () =>
      api.api
        .posts({ id })
        .get()
        .then((r) => r.data),
  });

  // Loading, bad ids, and offline must not render a blank screen.
  if (isPending) {
    return (
      <SafeAreaView className="bg-background">
        <View className="h-full w-full p-4">
          <Text className="text-foreground">Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView className="bg-background">
        <View className="h-full w-full p-4">
          <Text className="text-destructive">Could not load post</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="bg-background">
      <Stack.Screen options={{ title: data.title }} />
      <View className="h-full w-full p-4">
        <Text className="text-primary py-2 text-3xl font-bold">
          {data.title}
        </Text>
        <Text className="text-foreground py-4">{data.content}</Text>
      </View>
    </SafeAreaView>
  );
}
