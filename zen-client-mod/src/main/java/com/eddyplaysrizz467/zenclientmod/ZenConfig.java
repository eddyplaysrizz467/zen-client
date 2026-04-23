package com.eddyplaysrizz467.zenclientmod;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import net.fabricmc.loader.api.FabricLoader;

public final class ZenConfig {
  private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
  private static final Path CONFIG_PATH = FabricLoader.getInstance().getConfigDir().resolve("zen-client.json");

  private final LinkedHashSet<String> enabledIds = new LinkedHashSet<>();

  public static ZenConfig load() {
    ZenConfig config = new ZenConfig();
    if (!Files.exists(CONFIG_PATH)) return config;

    try (Reader reader = Files.newBufferedReader(CONFIG_PATH, StandardCharsets.UTF_8)) {
      JsonObject root = JsonParser.parseReader(reader).getAsJsonObject();
      if (root.has("enabled") && root.get("enabled").isJsonArray()) {
        root.getAsJsonArray("enabled").forEach(element -> {
          ZenFeature feature = ZenFeature.byId(element.getAsString());
          if (feature != null) config.enabledIds.add(feature.id());
        });
      }
    } catch (Exception ignored) {
      // Keep defaults if the file is unreadable.
    }
    return config;
  }

  public void save() {
    try {
      Files.createDirectories(CONFIG_PATH.getParent());
      JsonObject root = new JsonObject();
      root.add("enabled", GSON.toJsonTree(enabledIds));
      try (Writer writer = Files.newBufferedWriter(CONFIG_PATH, StandardCharsets.UTF_8)) {
        GSON.toJson(root, writer);
      }
    } catch (IOException ignored) {
      // Ignore config save failures so the client still runs.
    }
  }

  public boolean isEnabled(ZenFeature feature) {
    return enabledIds.contains(feature.id());
  }

  public void toggle(ZenFeature feature) {
    if (enabledIds.remove(feature.id())) {
      save();
      return;
    }
    enabledIds.add(feature.id());
    save();
  }

  public List<ZenFeature> orderedEnabledFeatures() {
    List<ZenFeature> ordered = new ArrayList<>();
    for (String id : enabledIds) {
      ZenFeature feature = ZenFeature.byId(id);
      if (feature != null) ordered.add(feature);
    }
    return ordered;
  }
}
