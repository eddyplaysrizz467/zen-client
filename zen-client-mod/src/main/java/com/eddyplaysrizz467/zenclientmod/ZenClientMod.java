package com.eddyplaysrizz467.zenclientmod;

import com.mojang.blaze3d.platform.InputConstants;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;
import org.lwjgl.glfw.GLFW;

public final class ZenClientMod implements ClientModInitializer {
  private static final int MAX_VISIBLE_MODULES = 10;
  private static final long CLICK_WINDOW_MS = 1000L;
  private static final int FULLBRIGHT_NIGHT_VISION_DURATION = 1_000_000;
  private static final int HUD_BOX_PADDING = 4;
  private static final int HUD_BOX_HEIGHT = 18;
  private static final int HUD_BOX_GAP = 4;

  private static ZenClientMod INSTANCE;
  private static ZenConfig CONFIG;
  private static final Deque<Long> LEFT_CLICKS = new ArrayDeque<>();
  private static final Deque<Long> RIGHT_CLICKS = new ArrayDeque<>();
  private static final Deque<Double> SERVER_TPS_SAMPLES = new ArrayDeque<>();
  private static final Set<Integer> ESP_ENTITY_IDS = new HashSet<>();

  private static boolean lastAttackDown = false;
  private static boolean lastUseDown = false;
  private static boolean lastCtrlPDown = false;
  private static long lastServerSampleAt = 0L;
  private static long lastWorldGameTime = Long.MIN_VALUE;
  private static double estimatedServerTps = 20.0D;
  private static int comboCount = 0;
  private static long lastComboAt = 0L;
  private static double lastReach = 0.0D;
  private static float lastTargetHealth = -1.0F;
  private static float previousGamma = 1.0F;
  private static int previousFov = 70;
  private static int previousSimulationDistance = 12;
  private static double previousEntityDistanceScaling = 1.0D;
  private static int previousMipmapLevels = 4;
  private static boolean previousAutoJump = false;
  private static boolean previousBobView = true;
  private static boolean previousAo = true;
  private static boolean previousVsync = false;
  private static boolean previousMayfly = false;
  private static boolean previousFlying = false;
  private static float previousFlightSpeed = 0.05F;
  private static boolean gammaBoostApplied = false;
  private static boolean addedZenNightVision = false;
  private static boolean fovLockApplied = false;
  private static boolean autoJumpApplied = false;
  private static boolean noBobApplied = false;
  private static boolean pureFpsApplied = false;
  private static boolean flightApplied = false;
  private static int hitPulseTicks = 0;

  public static ZenConfig config() {
    return CONFIG;
  }

  @Override
  public void onInitializeClient() {
    INSTANCE = this;
    CONFIG = ZenConfig.load();

    ScreenEvents.AFTER_INIT.register((client, screen, scaledWidth, scaledHeight) -> {
      if (!(screen instanceof PauseScreen)) return;
      Screens.getButtons(screen).add(
        Button.builder(Component.literal("Zen Client Settings"), button -> client.setScreen(new ZenSettingsScreen(screen)))
          .bounds(6, 6, 150, 20)
          .build()
      );
    });

    ClientTickEvents.END_CLIENT_TICK.register(this::onEndTick);
    ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> resetSession());
    HudRenderCallback.EVENT.register((drawContext, tickCounter) -> renderHud(Minecraft.getInstance(), drawContext));
  }

  private void onEndTick(Minecraft client) {
    handleActiveModulesHotkey(client);

    if (client.player == null) {
      pruneClicks(System.currentTimeMillis());
      maintainFullbright(client, null);
      maintainClientOptions(client);
      return;
    }

    boolean attackDown = client.options.keyAttack.isDown();
    boolean useDown = client.options.keyUse.isDown();

    if (attackDown && !lastAttackDown) {
      LEFT_CLICKS.addLast(System.currentTimeMillis());
      registerAttack(client);
    }
    if (useDown && !lastUseDown) {
      RIGHT_CLICKS.addLast(System.currentTimeMillis());
    }
    lastAttackDown = attackDown;
    lastUseDown = useDown;
    pruneClicks(System.currentTimeMillis());

    LocalPlayer player = client.player;
    updateEstimatedServerTps(client);
    maintainFullbright(client, player);
    maintainClientOptions(client);
    maintainFlight(client, player);
    maintainEsp(client);

    if (CONFIG.isEnabled(ZenFeature.TOGGLE_SPRINT) || CONFIG.isEnabled(ZenFeature.SPRINT_ASSIST)) {
      if (player.input != null && player.input.hasForwardImpulse() && !player.isShiftKeyDown()) {
        player.setSprinting(true);
      }
    }
  }

  private void registerAttack(Minecraft client) {
    if (!(client.hitResult instanceof EntityHitResult entityHit)) return;
    if (!(entityHit.getEntity() instanceof LivingEntity living)) return;

    lastReach = Math.sqrt(client.player.distanceToSqr(living));
    lastTargetHealth = living.getHealth();
    hitPulseTicks = 10;

    long now = System.currentTimeMillis();
    if (now - lastComboAt <= 2000L) comboCount += 1;
    else comboCount = 1;
    lastComboAt = now;
  }

  private void resetSession() {
    LEFT_CLICKS.clear();
    RIGHT_CLICKS.clear();
    SERVER_TPS_SAMPLES.clear();
    comboCount = 0;
    lastComboAt = 0L;
    lastReach = 0.0D;
    lastTargetHealth = -1.0F;
    lastServerSampleAt = 0L;
    lastWorldGameTime = Long.MIN_VALUE;
    estimatedServerTps = 20.0D;
    hitPulseTicks = 0;
    gammaBoostApplied = false;
    addedZenNightVision = false;
    fovLockApplied = false;
    autoJumpApplied = false;
    noBobApplied = false;
    pureFpsApplied = false;
    flightApplied = false;
    ESP_ENTITY_IDS.clear();
  }

  public static List<String> activeModuleLines(Minecraft client) {
    if (INSTANCE == null || client == null || client.player == null) return List.of();
    return INSTANCE.buildModules(client);
  }

  private void pruneClicks(long nowMs) {
    while (!LEFT_CLICKS.isEmpty() && nowMs - LEFT_CLICKS.peekFirst() > CLICK_WINDOW_MS) LEFT_CLICKS.removeFirst();
    while (!RIGHT_CLICKS.isEmpty() && nowMs - RIGHT_CLICKS.peekFirst() > CLICK_WINDOW_MS) RIGHT_CLICKS.removeFirst();
    if (nowMs - lastComboAt > 2000L) comboCount = 0;
    if (hitPulseTicks > 0) hitPulseTicks -= 1;
  }

  private void renderHud(Minecraft client, GuiGraphics drawContext) {
    if (client == null || client.player == null || client.options.hideGui) return;

    renderCenterEffects(client, drawContext);
    renderCompassHud(client, drawContext);

    List<String> modules = buildModules(client);
    if (modules.isEmpty()) return;

    int x = 8;
    int y = 8;
    int visible = Math.min(MAX_VISIBLE_MODULES, modules.size());

    for (int i = 0; i < visible; i++) {
      String text = modules.get(i);
      int top = y + (i * (HUD_BOX_HEIGHT + HUD_BOX_GAP));
      int width = Math.max(60, client.font.width(text));
      drawContext.fill(
        x - HUD_BOX_PADDING,
        top - HUD_BOX_PADDING,
        x + width + HUD_BOX_PADDING,
        top + HUD_BOX_HEIGHT,
        0x8C050505
      );
      drawContext.drawString(client.font, Component.literal(text), x, top + 4, 0xFFFFFFFF, true);
    }

    int hiddenCount = modules.size() - visible;
    if (hiddenCount > 0) {
      String overflow = "+" + hiddenCount;
      int overflowTop = y + (visible * (HUD_BOX_HEIGHT + HUD_BOX_GAP));
      int width = client.font.width(overflow);
      drawContext.fill(
        x - HUD_BOX_PADDING,
        overflowTop - HUD_BOX_PADDING,
        x + width + HUD_BOX_PADDING,
        overflowTop + HUD_BOX_HEIGHT,
        0x6A202020
      );
      drawContext.drawString(client.font, Component.literal(overflow), x, overflowTop + 4, 0xFFD7D7D7, true);
    }
  }

  private void renderCompassHud(Minecraft client, GuiGraphics drawContext) {
    if (!CONFIG.isEnabled(ZenFeature.COMPASS)) return;

    float yaw = Mth.wrapDegrees(client.player.getYRot());
    String heading = headingFromYaw(yaw);
    int degrees = Math.floorMod(Math.round(yaw), 360);
    String degreeText = String.format(Locale.US, "%03d° %s", degrees, heading);

    int centerX = client.getWindow().getGuiScaledWidth() / 2;
    int y = client.getWindow().getGuiScaledHeight() - 46;
    int barWidth = 180;
    int barLeft = centerX - (barWidth / 2);
    int barRight = centerX + (barWidth / 2);
    int barTop = y - 11;
    int barBottom = y + 11;

    drawContext.fill(
      barLeft - 8,
      barTop - 8,
      barRight + 8,
      barBottom + 16,
      0x8C050505
    );
    drawContext.fill(centerX - 1, barTop + 2, centerX + 1, barBottom - 2, 0xFFFF5A5A);
    drawContext.drawCenteredString(client.font, Component.literal(degreeText), centerX, y + 14, 0xFFFFFFFF);

    for (int marker = 0; marker < 360; marker += 15) {
      float delta = wrapDegreesForHud(marker - yaw);
      if (Math.abs(delta) > 70.0F) continue;

      int markerX = centerX + Math.round(delta * 1.25F);
      int tickHeight = marker % 90 == 0 ? 10 : (marker % 45 == 0 ? 7 : 4);
      int color = marker == 0 ? 0xFFFF6B6B : 0xD9F1F1F1;
      drawContext.fill(markerX, y - tickHeight / 2, markerX + 1, y + tickHeight / 2, color);

      if (marker % 45 == 0) {
        drawContext.drawCenteredString(client.font, Component.literal(cardinalLabel(marker)), markerX, y - 18, color);
      }
    }
  }

  private void updateEstimatedServerTps(Minecraft client) {
    if (client.level == null) return;

    long now = System.currentTimeMillis();
    long worldGameTime = client.level.getGameTime();

    if (lastServerSampleAt == 0L || lastWorldGameTime == Long.MIN_VALUE) {
      lastServerSampleAt = now;
      lastWorldGameTime = worldGameTime;
      return;
    }

    long elapsedMs = now - lastServerSampleAt;
    long worldDelta = worldGameTime - lastWorldGameTime;
    if (elapsedMs < 250L || worldDelta <= 0L) return;

    double sample = Mth.clamp((worldDelta * 1000.0D) / elapsedMs, 0.0D, 20.0D);
    SERVER_TPS_SAMPLES.addLast(sample);
    while (SERVER_TPS_SAMPLES.size() > 20) SERVER_TPS_SAMPLES.removeFirst();
    estimatedServerTps = SERVER_TPS_SAMPLES.stream().mapToDouble(Double::doubleValue).average().orElse(20.0D);
    lastServerSampleAt = now;
    lastWorldGameTime = worldGameTime;
  }

  private void maintainFullbright(Minecraft client, LocalPlayer player) {
    if (CONFIG.isEnabled(ZenFeature.FULLBRIGHT)) {
      if (!gammaBoostApplied) {
        previousGamma = client.options.gamma().get().floatValue();
        gammaBoostApplied = true;
      }
      if (client.options.gamma().get().floatValue() < 16.0F) {
        client.options.gamma().set(16.0D);
      }

      if (player != null) {
        MobEffectInstance currentNightVision = player.getEffect(MobEffects.NIGHT_VISION);
        if (currentNightVision == null) {
          player.addEffect(new MobEffectInstance(MobEffects.NIGHT_VISION, FULLBRIGHT_NIGHT_VISION_DURATION, 0, true, false, false));
          addedZenNightVision = true;
        } else if (addedZenNightVision && currentNightVision.getDuration() < FULLBRIGHT_NIGHT_VISION_DURATION / 2) {
          player.addEffect(new MobEffectInstance(MobEffects.NIGHT_VISION, FULLBRIGHT_NIGHT_VISION_DURATION, 0, true, false, false));
        }
      }
      return;
    }

    if (gammaBoostApplied) {
      client.options.gamma().set((double) previousGamma);
      gammaBoostApplied = false;
    }

    if (player != null && addedZenNightVision && player.hasEffect(MobEffects.NIGHT_VISION)) {
      player.removeEffect(MobEffects.NIGHT_VISION);
    }
    addedZenNightVision = false;
  }

  private void maintainClientOptions(Minecraft client) {
    if (CONFIG.isEnabled(ZenFeature.AUTO_JUMP)) {
      if (!autoJumpApplied) {
        previousAutoJump = client.options.autoJump().get();
        autoJumpApplied = true;
      }
      client.options.autoJump().set(true);
    } else if (autoJumpApplied) {
      client.options.autoJump().set(previousAutoJump);
      autoJumpApplied = false;
    }

    if (CONFIG.isEnabled(ZenFeature.NO_BOB)) {
      if (!noBobApplied) {
        previousBobView = client.options.bobView().get();
        noBobApplied = true;
      }
      client.options.bobView().set(false);
    } else if (noBobApplied) {
      client.options.bobView().set(previousBobView);
      noBobApplied = false;
    }

    if (CONFIG.isEnabled(ZenFeature.FOV_LOCK)) {
      if (!fovLockApplied) {
        previousFov = client.options.fov().get();
        fovLockApplied = true;
      }
      client.options.fov().set(70);
    } else if (fovLockApplied) {
      client.options.fov().set(previousFov);
      fovLockApplied = false;
    }

    if (CONFIG.isEnabled(ZenFeature.PURE_FPS)) {
      if (!pureFpsApplied) {
        previousSimulationDistance = client.options.simulationDistance().get();
        previousEntityDistanceScaling = client.options.entityDistanceScaling().get();
        previousMipmapLevels = client.options.mipmapLevels().get();
        previousAo = client.options.ambientOcclusion().get();
        previousVsync = client.options.enableVsync().get();
        pureFpsApplied = true;
      }

      client.options.simulationDistance().set(4);
      client.options.entityDistanceScaling().set(0.5D);
      client.options.mipmapLevels().set(0);
      client.options.ambientOcclusion().set(false);
      client.options.enableVsync().set(false);
      client.options.bobView().set(false);
      client.options.fov().set(70);
    } else if (pureFpsApplied) {
      client.options.simulationDistance().set(previousSimulationDistance);
      client.options.entityDistanceScaling().set(previousEntityDistanceScaling);
      client.options.mipmapLevels().set(previousMipmapLevels);
      client.options.ambientOcclusion().set(previousAo);
      client.options.enableVsync().set(previousVsync);
      pureFpsApplied = false;
    }
  }

  private void maintainFlight(Minecraft client, LocalPlayer player) {
    if (!CONFIG.isEnabled(ZenFeature.FLIGHT)) {
      if (flightApplied) {
        player.getAbilities().mayfly = previousMayfly;
        player.getAbilities().flying = previousMayfly && previousFlying;
        player.getAbilities().setFlyingSpeed(previousFlightSpeed);
        player.onUpdateAbilities();
        flightApplied = false;
      }
      return;
    }

    if (!flightApplied) {
      previousMayfly = player.getAbilities().mayfly;
      previousFlying = player.getAbilities().flying;
      previousFlightSpeed = player.getAbilities().getFlyingSpeed();
      flightApplied = true;
    }

    ZenFlightMode mode = CONFIG.flightMode();
    float speed = (float) Mth.clamp(CONFIG.flightSpeed(), 0.4D, 3.0D);

    player.getAbilities().mayfly = true;
    player.getAbilities().flying = true;
    player.getAbilities().setFlyingSpeed(0.05F * speed);

    if (mode == ZenFlightMode.DRIFT) {
      Vec3 movement = player.getDeltaMovement();
      double driftDown = client.options.keyShift.isDown() ? -0.18D * speed : -0.03D;
      player.setDeltaMovement(movement.x * 0.96D, Math.max(movement.y, driftDown), movement.z * 0.96D);
    } else if (mode == ZenFlightMode.DASH) {
      if (player.input != null && player.input.hasForwardImpulse()) {
        Vec3 look = player.getLookAngle();
        Vec3 flat = new Vec3(look.x, 0.0D, look.z);
        if (flat.lengthSqr() > 0.0001D) {
          Vec3 dash = flat.normalize().scale(0.055D * speed);
          player.setDeltaMovement(player.getDeltaMovement().add(dash));
        }
      }
    }

    player.onUpdateAbilities();
  }

  private void maintainEsp(Minecraft client) {
    if (client.level == null || client.player == null) return;

    if (!CONFIG.isEnabled(ZenFeature.ESP)) {
      clearEsp(client);
      return;
    }

    Set<Integer> nextIds = new HashSet<>();
    for (Entity entity : client.level.entitiesForRendering()) {
      if (entity == client.player) continue;
      if (!matchesEspTarget(entity)) continue;
      entity.setGlowingTag(true);
      nextIds.add(entity.getId());
    }

    for (Integer id : ESP_ENTITY_IDS) {
      if (nextIds.contains(id)) continue;
      Entity entity = client.level.getEntity(id);
      if (entity != null) entity.setGlowingTag(false);
    }

    ESP_ENTITY_IDS.clear();
    ESP_ENTITY_IDS.addAll(nextIds);
  }

  private void clearEsp(Minecraft client) {
    if (client.level == null) return;
    for (Integer id : ESP_ENTITY_IDS) {
      Entity entity = client.level.getEntity(id);
      if (entity != null) entity.setGlowingTag(false);
    }
    ESP_ENTITY_IDS.clear();
  }

  private boolean matchesEspTarget(Entity entity) {
    for (ZenEspTarget target : CONFIG.orderedEspTargets()) {
      if (matchesEspTarget(target, entity)) return true;
    }
    return false;
  }

  private boolean matchesEspTarget(ZenEspTarget target, Entity entity) {
    String typeName = entity.getType().toString().toLowerCase(Locale.ROOT);
    return switch (target) {
      case PLAYERS -> entity instanceof Player;
      case HOSTILE -> entity instanceof Enemy;
      case PASSIVE -> entity instanceof Animal;
      case VILLAGERS -> typeName.contains("villager") || typeName.contains("trader");
      case ITEMS -> entity instanceof ItemEntity;
      case PROJECTILES -> entity instanceof Projectile;
      case BOATS -> typeName.contains("boat") || typeName.contains("raft");
      case MINECARTS -> typeName.contains("minecart");
      case ENDER_CRYSTALS -> typeName.contains("end_crystal");
      case TAMED -> entity instanceof TamableAnimal tamable && tamable.isTame();
    };
  }

  private void renderCenterEffects(Minecraft client, GuiGraphics drawContext) {
    int centerX = client.getWindow().getGuiScaledWidth() / 2;
    int centerY = client.getWindow().getGuiScaledHeight() / 2;

    if (CONFIG.isEnabled(ZenFeature.CLEAN_CROSSHAIR)) {
      int color = 0xF3F3F3;
      drawContext.fill(centerX - 1, centerY - 6, centerX + 1, centerY - 1, color);
      drawContext.fill(centerX - 1, centerY + 2, centerX + 1, centerY + 7, color);
      drawContext.fill(centerX - 6, centerY - 1, centerX - 1, centerY + 1, color);
      drawContext.fill(centerX + 2, centerY - 1, centerX + 7, centerY + 1, color);
    }

    if (CONFIG.isEnabled(ZenFeature.HIT_COLOR) && hitPulseTicks > 0) {
      int alpha = Math.max(25, Math.min(120, hitPulseTicks * 10));
      int color = (alpha << 24) | 0xF3F3F3;
      drawContext.fill(centerX - 10, centerY - 10, centerX + 10, centerY + 10, color);
    }
  }

  private List<String> buildModules(Minecraft client) {
    LocalPlayer player = client.player;
    List<String> modules = new ArrayList<>();

    for (ZenFeature feature : CONFIG.orderedEnabledFeatures()) {
      String text = switch (feature) {
        case TPS_COUNTER -> format("TPS %.1f", estimatedServerTps);
        case FPS_COUNTER -> "FPS " + Minecraft.getInstance().getFps();
        case PING_COUNTER -> buildPing(client);
        case COORDINATES -> format("XYZ %.1f %.1f %.1f", player.getX(), player.getY(), player.getZ());
        case CLOCK -> buildClock(client);
        case DAY_COUNTER -> "Day " + buildDayCount(client);
        case BIOME -> "Biome " + buildBiome(client);
        case SPEED -> format("Speed %.2f b/s", buildHorizontalSpeed(player));
        case LIGHT_LEVEL -> "Light " + client.level.getMaxLocalRawBrightness(player.blockPosition());
        case HELD_DURABILITY -> buildHeldDurability(player);
        case SNEAK_STATUS -> player.isShiftKeyDown() ? "Sneaking" : "Standing";
        case DIRECTION -> format("Facing %s %03d", player.getDirection().getName().toUpperCase(Locale.US), Math.floorMod(Math.round(Mth.wrapDegrees(player.getYRot())), 360));
        case CPS_COUNTER -> "CPS " + LEFT_CLICKS.size() + " | " + RIGHT_CLICKS.size();
        case COMBO_COUNTER -> "Combo " + comboCount;
        case REACH_DISPLAY -> lastReach > 0.0D ? format("Reach %.2f", lastReach) : "Reach --";
        case KESTROKES -> buildKeystrokes(client);
        case BOW_CHARGE -> buildBowCharge(player);
        case PEARL_TIMER -> buildPearlCooldown(player);
        case ARROW_COUNT -> "Arrows " + countItem(player, Items.ARROW);
        case ARMOR_STATUS -> buildArmorStatus(player);
        case POTION_STATUS -> "Effects " + player.getActiveEffects().size();
        case TARGET_HEALTH -> lastTargetHealth >= 0.0F ? format("Target %.1f", lastTargetHealth) : "Target --";
        case ESP -> buildEspStatus();
        case TOGGLE_SPRINT -> "Toggle Sprint";
        case SPRINT_ASSIST -> "Sprint Assist";
        case AUTO_JUMP -> "Auto Jump";
        case NO_BOB -> "No Bob";
        case FOV_LOCK -> "FOV Lock";
        case FLIGHT -> buildFlightStatus();
        case PURE_FPS -> "Pure FPS";
        case CLEAN_CROSSHAIR -> "Clean Crosshair";
        case HIT_COLOR -> "Hit Color Pulse";
        case FULLBRIGHT -> "Fullbright";
        case COMPASS -> null;
      };

      if (text != null && !text.isBlank()) modules.add(text);
    }

    return modules;
  }

  private String buildFlightStatus() {
    return format("Flight %s %.1fx", CONFIG.flightMode().label(), CONFIG.flightSpeed());
  }

  private String buildPing(Minecraft client) {
    if (client.getConnection() == null || client.player == null) return "Ping --";
    var info = client.getConnection().getPlayerInfo(client.player.getUUID());
    if (info == null) return "Ping --";
    return "Ping " + info.getLatency() + "ms";
  }

  private String buildClock(Minecraft client) {
    if (client.level == null) return "Clock --:--";
    long timeOfDay = client.level.getDayTime() % 24000L;
    int hours = (int) ((timeOfDay / 1000L + 6L) % 24L);
    int minutes = (int) Math.round((timeOfDay % 1000L) * 0.06D);
    if (minutes >= 60) {
      minutes = 0;
      hours = (hours + 1) % 24;
    }
    return String.format(Locale.US, "Clock %02d:%02d", hours, minutes);
  }

  private long buildDayCount(Minecraft client) {
    if (client.level == null) return 0L;
    return (client.level.getDayTime() / 24000L) + 1L;
  }

  private String buildBiome(Minecraft client) {
    if (client.level == null || client.player == null) return "--";
    Optional<String> biomePath = client.level.getBiome(client.player.blockPosition()).unwrapKey().map((key) -> {
      String raw = key.toString();
      int slash = raw.lastIndexOf('/');
      return slash >= 0 ? raw.substring(slash + 1) : raw;
    });
    return biomePath.map(this::humanizeId).orElse("--");
  }

  private double buildHorizontalSpeed(LocalPlayer player) {
    double dx = player.getX() - player.xo;
    double dz = player.getZ() - player.zo;
    return Math.sqrt((dx * dx) + (dz * dz)) * 20.0D;
  }

  private String buildHeldDurability(Player player) {
    ItemStack stack = player.getMainHandItem();
    if (stack.isEmpty()) return "Held --";
    if (!stack.isDamageableItem()) return stack.getHoverName().getString();
    int remaining = stack.getMaxDamage() - stack.getDamageValue();
    return stack.getHoverName().getString() + " " + remaining;
  }

  private String buildEspStatus() {
    List<ZenEspTarget> targets = CONFIG.orderedEspTargets();
    if (targets.isEmpty()) return "ESP --";
    if (targets.size() == 1) return "ESP " + targets.get(0).label();
    return "ESP " + targets.get(0).label() + " +" + (targets.size() - 1);
  }

  private String buildKeystrokes(Minecraft client) {
    String w = client.options.keyUp.isDown() ? "W" : "-";
    String a = client.options.keyLeft.isDown() ? "A" : "-";
    String s = client.options.keyDown.isDown() ? "S" : "-";
    String d = client.options.keyRight.isDown() ? "D" : "-";
    String lmb = client.options.keyAttack.isDown() ? "LMB" : "-";
    String rmb = client.options.keyUse.isDown() ? "RMB" : "-";
    return w + " " + a + " " + s + " " + d + " | " + lmb + " " + rmb;
  }

  private String buildBowCharge(Player player) {
    ItemStack inUse = player.getUseItem();
    if (!player.isUsingItem() || !inUse.is(Items.BOW)) return "Bow --";
    int useTicks = inUse.getUseDuration(player) - player.getUseItemRemainingTicks();
    float pull = Mth.clamp(useTicks / 20.0F, 0.0F, 1.0F);
    return format("Bow %d%%", Math.round(pull * 100.0F));
  }

  private String buildPearlCooldown(Player player) {
    float percent = player.getCooldowns().getCooldownPercent(new ItemStack(Items.ENDER_PEARL), 0.0F);
    if (percent <= 0.0F) return "Pearl Ready";
    return format("Pearl %.1fs", percent * 20.0F);
  }

  private String buildArmorStatus(Player player) {
    int max = 0;
    int remaining = 0;
    EquipmentSlot[] armorSlots = {
      EquipmentSlot.HEAD,
      EquipmentSlot.CHEST,
      EquipmentSlot.LEGS,
      EquipmentSlot.FEET,
      EquipmentSlot.BODY
    };
    for (EquipmentSlot slot : armorSlots) {
      ItemStack stack = player.getItemBySlot(slot);
      if (!stack.isDamageableItem()) continue;
      max += stack.getMaxDamage();
      remaining += stack.getMaxDamage() - stack.getDamageValue();
    }
    if (max <= 0) return "Armor --";
    int percent = Math.round((remaining * 100.0F) / max);
    return "Armor " + percent + "%";
  }

  private int countItem(Player player, net.minecraft.world.item.Item item) {
    int count = 0;
    for (int slot = 0; slot < player.getInventory().getContainerSize(); slot++) {
      ItemStack stack = player.getInventory().getItem(slot);
      if (stack.is(item)) count += stack.getCount();
    }
    for (InteractionHand hand : InteractionHand.values()) {
      ItemStack handStack = player.getItemInHand(hand);
      if (handStack.is(item)) count += handStack.getCount();
    }
    return count;
  }

  private String format(String pattern, Object... args) {
    return String.format(Locale.US, pattern, args);
  }

  private String headingFromYaw(float yaw) {
    if (yaw >= -22.5F && yaw < 22.5F) return "S";
    if (yaw >= 22.5F && yaw < 67.5F) return "SW";
    if (yaw >= 67.5F && yaw < 112.5F) return "W";
    if (yaw >= 112.5F && yaw < 157.5F) return "NW";
    if (yaw >= 157.5F || yaw < -157.5F) return "N";
    if (yaw >= -157.5F && yaw < -112.5F) return "NE";
    if (yaw >= -112.5F && yaw < -67.5F) return "E";
    return "SE";
  }

  private float wrapDegreesForHud(float value) {
    float wrapped = value % 360.0F;
    if (wrapped >= 180.0F) wrapped -= 360.0F;
    if (wrapped < -180.0F) wrapped += 360.0F;
    return wrapped;
  }

  private String cardinalLabel(int degrees) {
    return switch (Math.floorMod(degrees, 360)) {
      case 0 -> "N";
      case 45 -> "NE";
      case 90 -> "E";
      case 135 -> "SE";
      case 180 -> "S";
      case 225 -> "SW";
      case 270 -> "W";
      case 315 -> "NW";
      default -> "";
    };
  }

  private String humanizeId(String value) {
    String[] parts = value.split("_");
    StringBuilder out = new StringBuilder();
    for (String part : parts) {
      if (part.isBlank()) continue;
      if (!out.isEmpty()) out.append(" ");
      out.append(Character.toUpperCase(part.charAt(0)));
      if (part.length() > 1) out.append(part.substring(1));
    }
    return out.toString();
  }

  private void handleActiveModulesHotkey(Minecraft client) {
    if (client == null) return;
    var window = client.getWindow();
    boolean ctrlDown = InputConstants.isKeyDown(window, GLFW.GLFW_KEY_LEFT_CONTROL)
      || InputConstants.isKeyDown(window, GLFW.GLFW_KEY_RIGHT_CONTROL);
    boolean pDown = InputConstants.isKeyDown(window, GLFW.GLFW_KEY_P);
    boolean comboDown = ctrlDown && pDown;

    if (comboDown && !lastCtrlPDown && client.screen == null) {
      client.setScreen(new ZenActiveModulesScreen());
    }

    lastCtrlPDown = comboDown;
  }
}
