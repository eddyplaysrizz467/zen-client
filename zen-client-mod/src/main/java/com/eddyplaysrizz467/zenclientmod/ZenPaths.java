package com.eddyplaysrizz467.zenclientmod;

import java.nio.file.Path;
import net.minecraft.client.Minecraft;

public final class ZenPaths {
  private ZenPaths() {
  }

  public static Path configDir() {
    try {
      Minecraft minecraft = Minecraft.getInstance();
      if (minecraft != null && minecraft.gameDirectory != null) {
        return minecraft.gameDirectory.toPath().resolve("config");
      }
    } catch (Throwable ignored) {
      // Fall through to the generic path below.
    }
    return Path.of(".").toAbsolutePath().normalize().resolve("config");
  }
}
