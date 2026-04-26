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
  private static final double MIN_FLIGHT_SPEED = 0.4D;
  private static final double MAX_FLIGHT_SPEED = 3.0D;

  private final LinkedHashSet<String> enabledIds = new LinkedHashSet<>();
  private final LinkedHashSet<String> espTargetIds = new LinkedHashSet<>();
  private String flightModeId = ZenFlightMode.VANILLA.id();
  private double flightSpeed = 1.0D;

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
      if (root.has("espTargets") && root.get("espTargets").isJsonArray()) {
        root.getAsJsonArray("espTargets").forEach(element -> {
          ZenEspTarget target = ZenEspTarget.byId(element.getAsString());
          if (target != null) config.espTargetIds.add(target.id());
        });
      }
      if (root.has("flightMode")) {
        config.flightModeId = ZenFlightMode.byId(root.get("flightMode").getAsString()).id();
      }
      if (root.has("flightSpeed")) {
        config.flightSpeed = clampFlightSpeed(root.get("flightSpeed").getAsDouble());
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
      root.add("espTargets", GSON.toJsonTree(espTargetIds));
      root.addProperty("flightMode", flightModeId);
      root.addProperty("flightSpeed", flightSpeed);
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

  public boolean isEspTargetEnabled(ZenEspTarget target) {
    return espTargetIds.contains(target.id());
  }

  public void toggleEspTarget(ZenEspTarget target) {
    if (espTargetIds.remove(target.id())) {
      save();
      return;
    }
    espTargetIds.add(target.id());
    save();
  }

  public List<ZenEspTarget> orderedEspTargets() {
    List<ZenEspTarget> ordered = new ArrayList<>();
    for (String id : espTargetIds) {
      ZenEspTarget target = ZenEspTarget.byId(id);
      if (target != null) ordered.add(target);
    }
    return ordered;
  }

  public ZenFlightMode flightMode() {
    return ZenFlightMode.byId(flightModeId);
  }

  public void cycleFlightMode() {
    flightModeId = flightMode().next().id();
    save();
  }

  public double flightSpeed() {
    return flightSpeed;
  }

  public void adjustFlightSpeed(double delta) {
    flightSpeed = clampFlightSpeed(flightSpeed + delta);
    save();
  }

  private static double clampFlightSpeed(double value) {
    return Math.max(MIN_FLIGHT_SPEED, Math.min(MAX_FLIGHT_SPEED, value));
  }
}
