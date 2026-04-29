package com.eddyplaysrizz467.zenclientmod;

import com.mojang.blaze3d.platform.InputConstants;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
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
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ServerboundMovePlayerPacket;
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
  private static final int MAX_VISIBLE_MODULES = 15;
  private static final long CLICK_WINDOW_MS = 1000L;
  private static final long AIM_ASSIST_CANCEL_MS = 650L;
  private static final long AIM_ASSIST_TARGET_MS = 7000L;
  private static final long DAMAGE_TRACK_MS = 2500L;
  private static final int FULLBRIGHT_NIGHT_VISION_DURATION = 1_000_000;
  private static final int MIN_SAFE_RENDER_DISTANCE = 6;
  private static final int MIN_SAFE_SIMULATION_DISTANCE = 5;
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
  private static boolean lastJumpDown = false;
  private static long lastServerSampleAt = 0L;
  private static long lastWorldGameTime = Long.MIN_VALUE;
  private static double estimatedServerTps = 20.0D;
  private static int comboCount = 0;
  private static long lastComboAt = 0L;
  private static double lastReach = 0.0D;
  private static float lastTargetHealth = -1.0F;
  private static float lastDamageDealt = 0.0F;
  private static int lastDamageTargetId = -1;
  private static long lastDamageObservedAt = 0L;
  private static float lastObservedYaw = 0.0F;
  private static float lastObservedPitch = 0.0F;
  private static float lastAimAssistYawApplied = 0.0F;
  private static float lastAimAssistPitchApplied = 0.0F;
  private static float previousGamma = 1.0F;
  private static int previousFov = 70;
  private static int previousRenderDistance = 12;
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
  private static boolean performanceProfileApplied = false;
  private static boolean flightApplied = false;
  private static int hitPulseTicks = 0;
  private static int aimAssistTargetId = -1;
  private static long aimAssistTargetExpiresAt = 0L;
  private static long aimAssistSuppressedUntil = 0L;

  private static final class ProjectedPoint {
    private final int x;
    private final int y;
    private final boolean clamped;
    private final boolean behind;

    private ProjectedPoint(int x, int y, boolean clamped, boolean behind) {
      this.x = x;
      this.y = y;
      this.clamped = clamped;
      this.behind = behind;
    }
  }

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
    updateDamageCounter(client);
    maintainFullbright(client, player);
    maintainClientOptions(client);
    maintainMeteorMovementModules(client, player);
    maintainFlight(client, player);
    maintainAimAssist(client, player);
    maintainAntiFall(player);
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
    lastDamageDealt = 0.0F;
    lastDamageTargetId = living.getId();
    lastDamageObservedAt = System.currentTimeMillis() + DAMAGE_TRACK_MS;
    hitPulseTicks = 10;
    if (CONFIG.isEnabled(ZenFeature.AIM_ASSIST)) {
      aimAssistTargetId = living.getId();
      aimAssistTargetExpiresAt = System.currentTimeMillis() + AIM_ASSIST_TARGET_MS;
    }

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
    lastDamageDealt = 0.0F;
    lastDamageTargetId = -1;
    lastDamageObservedAt = 0L;
    lastObservedYaw = 0.0F;
    lastObservedPitch = 0.0F;
    lastAimAssistYawApplied = 0.0F;
    lastAimAssistPitchApplied = 0.0F;
    lastServerSampleAt = 0L;
    lastWorldGameTime = Long.MIN_VALUE;
    estimatedServerTps = 20.0D;
    hitPulseTicks = 0;
    gammaBoostApplied = false;
    addedZenNightVision = false;
    fovLockApplied = false;
    autoJumpApplied = false;
    noBobApplied = false;
    performanceProfileApplied = false;
    flightApplied = false;
    aimAssistTargetId = -1;
    aimAssistTargetExpiresAt = 0L;
    aimAssistSuppressedUntil = 0L;
    ESP_ENTITY_IDS.clear();
    lastJumpDown = false;
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
    renderEspHud(client, drawContext);

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
    if (elapsedMs < 150L || worldDelta <= 0L) return;

    double sample = Mth.clamp((worldDelta * 1000.0D) / elapsedMs, 0.0D, 20.0D);
    if (SERVER_TPS_SAMPLES.size() >= 40) SERVER_TPS_SAMPLES.removeFirst();
    SERVER_TPS_SAMPLES.addLast(sample);

    double weighted = 0.0D;
    double weightTotal = 0.0D;
    int index = 1;
    for (double value : SERVER_TPS_SAMPLES) {
      double weight = index++;
      weighted += value * weight;
      weightTotal += weight;
    }
    double smoothed = weightTotal <= 0.0D ? sample : (weighted / weightTotal);
    estimatedServerTps = Mth.clamp((estimatedServerTps * 0.45D) + (smoothed * 0.55D), 0.0D, 20.0D);
    lastServerSampleAt = now;
    lastWorldGameTime = worldGameTime;
  }

  private void updateDamageCounter(Minecraft client) {
    if (client.level == null || lastDamageTargetId < 0) return;
    if (System.currentTimeMillis() > lastDamageObservedAt) {
      lastDamageTargetId = -1;
      return;
    }

    Entity entity = client.level.getEntity(lastDamageTargetId);
    if (!(entity instanceof LivingEntity living) || !living.isAlive()) {
      lastDamageTargetId = -1;
      return;
    }

    float currentHealth = living.getHealth();
    float damage = Math.max(0.0F, lastTargetHealth - currentHealth);
    if (damage > 0.0F) {
      lastDamageDealt = damage;
      lastTargetHealth = currentHealth;
      lastDamageObservedAt = System.currentTimeMillis() + DAMAGE_TRACK_MS;
    }
  }

  private void maintainFullbright(Minecraft client, LocalPlayer player) {
    if (CONFIG.isEnabled(ZenFeature.FULLBRIGHT)) {
      if (!gammaBoostApplied) {
        previousGamma = client.options.gamma().get().floatValue();
        gammaBoostApplied = true;
      }
      if (client.options.gamma().get().floatValue() < 1.0F) {
        client.options.gamma().set(1.0D);
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

    Integer targetFov = null;
    if (CONFIG.isEnabled(ZenFeature.ZOOM)) targetFov = 30;
    else if (CONFIG.isEnabled(ZenFeature.FOV_LOCK)) targetFov = 70;

    int targetSimulationDistance = -1;
    int targetRenderDistance = -1;
    double targetEntityDistanceScaling = -1.0D;
    int targetMipmapLevels = -1;
    Boolean targetAo = null;
    Boolean targetVsync = null;

    if (CONFIG.isEnabled(ZenFeature.PURE_FPS)) {
      targetRenderDistance = MIN_SAFE_RENDER_DISTANCE;
      targetSimulationDistance = MIN_SAFE_SIMULATION_DISTANCE;
      targetMipmapLevels = 0;
      targetAo = false;
      targetVsync = false;
    }

    int currentFps = Minecraft.getInstance().getFps();
    int currentPing = currentPingValue(client);
    boolean highPing = currentPing >= 180;
    boolean veryHighPing = currentPing >= 300;
    boolean lowFps = currentFps > 0 && currentFps <= 75;
    boolean veryLowFps = currentFps > 0 && currentFps <= 55;
    boolean extremeLowFps = currentFps > 0 && currentFps <= 35;

    if (veryHighPing || extremeLowFps) {
      targetRenderDistance =
        targetRenderDistance < 0
          ? MIN_SAFE_RENDER_DISTANCE
          : Math.min(targetRenderDistance, MIN_SAFE_RENDER_DISTANCE);
      targetSimulationDistance =
        targetSimulationDistance < 0
          ? MIN_SAFE_SIMULATION_DISTANCE
          : Math.min(targetSimulationDistance, MIN_SAFE_SIMULATION_DISTANCE);
      targetMipmapLevels = targetMipmapLevels < 0 ? 0 : Math.min(targetMipmapLevels, 0);
      targetAo = false;
      targetVsync = false;
    } else if (veryLowFps) {
      targetRenderDistance = targetRenderDistance < 0 ? 8 : Math.min(targetRenderDistance, 8);
      targetSimulationDistance = targetSimulationDistance < 0 ? 5 : Math.min(targetSimulationDistance, 5);
      targetMipmapLevels = targetMipmapLevels < 0 ? 0 : Math.min(targetMipmapLevels, 0);
      targetAo = false;
      targetVsync = false;
    } else if (highPing || lowFps) {
      targetRenderDistance = targetRenderDistance < 0 ? 10 : Math.min(targetRenderDistance, 10);
      targetSimulationDistance = targetSimulationDistance < 0 ? 6 : Math.min(targetSimulationDistance, 6);
      targetMipmapLevels = targetMipmapLevels < 0 ? 1 : Math.min(targetMipmapLevels, 1);
      targetAo = false;
      targetVsync = false;
    }

    boolean performanceProfileWanted =
      targetRenderDistance >= 0
        || targetSimulationDistance >= 0
        || targetEntityDistanceScaling >= 0.0D
        || targetMipmapLevels >= 0
        || targetAo != null
        || targetVsync != null;

    if (performanceProfileWanted) {
      if (!performanceProfileApplied) {
        previousRenderDistance = client.options.renderDistance().get();
        previousSimulationDistance = client.options.simulationDistance().get();
        previousEntityDistanceScaling = client.options.entityDistanceScaling().get();
        previousMipmapLevels = client.options.mipmapLevels().get();
        previousAo = client.options.ambientOcclusion().get();
        previousVsync = client.options.enableVsync().get();
        performanceProfileApplied = true;
      }

      if (targetRenderDistance >= 0) {
        client.options.renderDistance().set(Math.max(MIN_SAFE_RENDER_DISTANCE, targetRenderDistance));
      }
      if (targetSimulationDistance >= 0) {
        client.options.simulationDistance().set(Math.max(MIN_SAFE_SIMULATION_DISTANCE, targetSimulationDistance));
      }
      if (targetEntityDistanceScaling >= 0.0D) client.options.entityDistanceScaling().set(targetEntityDistanceScaling);
      if (targetMipmapLevels >= 0) client.options.mipmapLevels().set(targetMipmapLevels);
      if (targetAo != null) client.options.ambientOcclusion().set(targetAo);
      if (targetVsync != null) client.options.enableVsync().set(targetVsync);
    } else if (performanceProfileApplied) {
      client.options.renderDistance().set(Math.max(MIN_SAFE_RENDER_DISTANCE, previousRenderDistance));
      client.options.simulationDistance().set(Math.max(MIN_SAFE_SIMULATION_DISTANCE, previousSimulationDistance));
      client.options.entityDistanceScaling().set(previousEntityDistanceScaling);
      client.options.mipmapLevels().set(previousMipmapLevels);
      client.options.ambientOcclusion().set(previousAo);
      client.options.enableVsync().set(previousVsync);
      performanceProfileApplied = false;
    }

    if (targetFov != null) {
      if (!fovLockApplied) {
        previousFov = client.options.fov().get();
        fovLockApplied = true;
      }
      client.options.fov().set(targetFov);
    } else if (fovLockApplied) {
      client.options.fov().set(previousFov);
      fovLockApplied = false;
    }
  }

  private void maintainMeteorMovementModules(Minecraft client, LocalPlayer player) {
    boolean jumpDown = client.options.keyJump.isDown();
    boolean jumpPressed = jumpDown && !lastJumpDown;
    Vec3 movement = player.getDeltaMovement();
    boolean movingForward = player.input != null && player.input.hasForwardImpulse();

    if (CONFIG.isEnabled(ZenFeature.SPEED_BOOST)
      && player.onGround()
      && movingForward
      && movement.horizontalDistanceSqr() > 0.0025D) {
      player.setDeltaMovement(movement.x * 1.035D, movement.y, movement.z * 1.035D);
      movement = player.getDeltaMovement();
    }

    if (CONFIG.isEnabled(ZenFeature.NO_SLOW)
      && player.isUsingItem()
      && movement.horizontalDistanceSqr() > 0.0004D) {
      player.setDeltaMovement(movement.x * 1.06D, movement.y, movement.z * 1.06D);
      movement = player.getDeltaMovement();
    }

    if (CONFIG.isEnabled(ZenFeature.AUTO_WALK) && client.screen == null) {
      Vec3 look = player.getLookAngle();
      Vec3 flat = new Vec3(look.x, 0.0D, look.z);
      if (flat.lengthSqr() > 0.0001D) {
        double push = player.onGround() ? 0.038D : 0.018D;
        player.setDeltaMovement(player.getDeltaMovement().add(flat.normalize().scale(push)));
      }
    }

    if (CONFIG.isEnabled(ZenFeature.SPIDER)
      && player.horizontalCollision
      && movingForward
      && !player.onGround()) {
      player.setDeltaMovement(player.getDeltaMovement().x, Math.max(player.getDeltaMovement().y, 0.22D), player.getDeltaMovement().z);
    }

    if (CONFIG.isEnabled(ZenFeature.AIR_JUMP)
      && jumpPressed
      && !player.onGround()
      && !player.onClimbable()
      && !player.isInWater()) {
      player.setDeltaMovement(player.getDeltaMovement().x, 0.42D, player.getDeltaMovement().z);
      player.resetFallDistance();
    }

    if (CONFIG.isEnabled(ZenFeature.PARKOUR)
      && player.onGround()
      && movingForward
      && !hasSupportAhead(player, 0.42D)) {
      player.jumpFromGround();
    }

    if (CONFIG.isEnabled(ZenFeature.SAFE_WALK)
      && player.onGround()
      && movement.horizontalDistanceSqr() > 0.001D
      && !hasSupportAhead(player, 0.28D)) {
      player.setDeltaMovement(0.0D, movement.y, 0.0D);
    }

    lastJumpDown = jumpDown;
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

    applyFlightMode(client, player, mode, speed);

    player.onUpdateAbilities();
  }

  private void maintainEsp(Minecraft client) {
    if (client.level == null || client.player == null || CONFIG.isEnabled(ZenFeature.ESP)) return;
    clearEsp(client);
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
    Minecraft client = Minecraft.getInstance();
    for (ZenEspTarget target : CONFIG.orderedEspTargets()) {
      if (matchesEspTarget(client, target, entity)) return true;
    }
    return false;
  }

  private boolean matchesEspTarget(Minecraft client, ZenEspTarget target, Entity entity) {
    String typeName = entity.getType().toString().toLowerCase(Locale.ROOT);
    return switch (target) {
      case PLAYERS -> entity instanceof Player other && isFriendlyPlayer(client, other);
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

  private boolean isFriendlyPlayer(Minecraft client, Player other) {
    if (client == null || client.player == null || other == client.player) return false;
    if (CONFIG.isFriendlyPlayerAllowed(other.getName().getString())) return true;
    return client.player.getTeam() != null && client.player.getTeam() == other.getTeam();
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

  private void renderEspHud(Minecraft client, GuiGraphics drawContext) {
    if ((!CONFIG.isEnabled(ZenFeature.ESP) && !CONFIG.isEnabled(ZenFeature.TRACERS) && !CONFIG.isEnabled(ZenFeature.NAME_TAGS))
      || client.level == null
      || client.player == null) return;

    List<Entity> targets = new ArrayList<>();
    for (Entity entity : client.level.entitiesForRendering()) {
      if (entity == client.player) continue;
      if (!matchesEspTarget(entity)) continue;
      if (client.player.distanceToSqr(entity) > 14400.0D) continue;
      targets.add(entity);
    }

    targets.sort(Comparator.comparingDouble(client.player::distanceToSqr));
    int limit = Math.min(12, targets.size());
    int centerX = client.getWindow().getGuiScaledWidth() / 2;
    int centerY = client.getWindow().getGuiScaledHeight() / 2;
    double fov = Math.max(40.0D, client.options.fov().get());
    for (int i = 0; i < limit; i++) {
      Entity entity = targets.get(i);
      Vec3 center = entity.getBoundingBox().getCenter();
      Vec3 topAnchor = center.add(0.0D, entity.getBbHeight() * 0.5D + 0.1D, 0.0D);
      Vec3 midAnchor = center.add(0.0D, entity.getBbHeight() * 0.15D, 0.0D);
      Vec3 bottomAnchor = center.add(0.0D, -entity.getBbHeight() * 0.5D, 0.0D);

      ProjectedPoint projectedMid = projectToHud(client, midAnchor, fov);
      ProjectedPoint projectedTop = projectToHud(client, topAnchor, fov);
      ProjectedPoint projectedBottom = projectToHud(client, bottomAnchor, fov);

      int x = projectedMid.x;
      int y = projectedMid.y;
      int color = espColorFor(entity);
      int distance = Math.round((float) Math.sqrt(client.player.distanceToSqr(entity)));
      String text = entity.getName().getString() + " " + distance + "m";
      int width = client.font.width(text);
      int boxHeight = Math.max(20, Math.abs(projectedBottom.y - projectedTop.y));
      int boxHalfHeight = Math.max(10, boxHeight / 2);
      int boxHalfWidth = Math.max(10, Math.round(boxHalfHeight * 0.38F));

      if (CONFIG.isEnabled(ZenFeature.TRACERS)) {
        int tracerTargetY = projectedBottom.behind ? y : Math.min(projectedBottom.y, y + boxHalfHeight);
        drawTracerLine(drawContext, centerX, centerY + 18, x, tracerTargetY, (color & 0x00FFFFFF) | 0xA0000000);
      }

      if (CONFIG.isEnabled(ZenFeature.ESP)) {
        drawContext.fill(x - boxHalfWidth, y - boxHalfHeight, x + boxHalfWidth, y + boxHalfHeight, 0x38101010);
        drawContext.fill(x - boxHalfWidth, y - boxHalfHeight, x + boxHalfWidth, y - boxHalfHeight + 2, color);
        drawContext.fill(x - boxHalfWidth, y + boxHalfHeight - 2, x + boxHalfWidth, y + boxHalfHeight, color);
        drawContext.fill(x - boxHalfWidth, y - boxHalfHeight, x - boxHalfWidth + 2, y + boxHalfHeight, color);
        drawContext.fill(x + boxHalfWidth - 2, y - boxHalfHeight, x + boxHalfWidth, y + boxHalfHeight, color);
        if (projectedMid.behind || projectedMid.clamped) {
          drawContext.drawCenteredString(client.font, Component.literal("<"), x - (boxHalfWidth + 8), y - 4, color);
          drawContext.drawCenteredString(client.font, Component.literal(">"), x + (boxHalfWidth + 8), y - 4, color);
        }
      }

      if (CONFIG.isEnabled(ZenFeature.NAME_TAGS)) {
        String label = text;
        if (entity instanceof LivingEntity living) {
          label += format(" %.1f HP", living.getHealth());
        }
        int labelWidth = client.font.width(label);
        int tagY = y - boxHalfHeight - 14;
        drawContext.fill(x - (labelWidth / 2) - 4, tagY - 2, x + (labelWidth / 2) + 4, tagY + 10, 0x7A050505);
        drawContext.drawString(client.font, Component.literal(label), x - (labelWidth / 2), tagY, 0xFFFFFFFF, true);
      } else if (CONFIG.isEnabled(ZenFeature.ESP)) {
        drawContext.drawString(client.font, Component.literal(text), x - (width / 2), y - boxHalfHeight - 12, color, true);
      }
    }
  }

  private int espColorFor(Entity entity) {
    if (entity instanceof Player) return 0xFF7FDBFF;
    if (entity instanceof Enemy) return 0xFFFF6B6B;
    if (entity instanceof Animal) return 0xFF7CFFB2;
    if (entity instanceof ItemEntity) return 0xFFFFE082;
    return 0xFFD4D4D4;
  }

  private ProjectedPoint projectToHud(Minecraft client, Vec3 worldPos, double fovDegrees) {
    int width = client.getWindow().getGuiScaledWidth();
    int height = client.getWindow().getGuiScaledHeight();
    int centerX = width / 2;
    int centerY = height / 2;
    int edgeX = 18;
    int edgeY = 18;
    Vec3 projected = client.gameRenderer.projectPointToScreen(worldPos);
    if (projected == null || !projected.isFinite()) {
      return new ProjectedPoint(centerX, centerY, true, true);
    }

    boolean behind = projected.z < 0.0D;
    int rawX;
    int rawY;
    if (behind) {
      float yaw = Mth.wrapDegrees((float) (Math.toDegrees(Math.atan2(worldPos.z - client.player.getZ(), worldPos.x - client.player.getX())) - 90.0D));
      float yawDelta = Mth.wrapDegrees(yaw - client.player.getYRot());
      rawX = yawDelta >= 0.0F ? width - edgeX : edgeX;
      rawY = centerY;
    } else {
      double px = projected.x;
      double py = projected.y;
      if (px >= 0.0D && px <= 1.0D && py >= 0.0D && py <= 1.0D) {
        rawX = (int) Math.round(px * width);
        rawY = (int) Math.round(py * height);
      } else if (Math.abs(px) <= 1.0D && Math.abs(py) <= 1.0D) {
        rawX = (int) Math.round((px * 0.5D + 0.5D) * width);
        rawY = (int) Math.round((0.5D - py * 0.5D) * height);
      } else {
        rawX = (int) Math.round(px);
        rawY = (int) Math.round(py);
      }
    }
    int clampedX = Mth.clamp(rawX, edgeX, width - edgeX);
    int clampedY = Mth.clamp(rawY, edgeY, height - edgeY - 24);
    boolean clamped = behind || clampedX != rawX || clampedY != rawY;
    return new ProjectedPoint(clampedX, clampedY, clamped, behind);
  }

  private void drawTracerLine(GuiGraphics drawContext, int startX, int startY, int endX, int endY, int color) {
    int steps = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
    if (steps <= 0) return;
    for (int i = 0; i <= steps; i += 4) {
      float t = i / (float) steps;
      int x = Math.round(Mth.lerp(t, startX, endX));
      int y = Math.round(Mth.lerp(t, startY, endY));
      drawContext.fill(x, y, x + 2, y + 2, color);
    }
  }

  private void maintainAimAssist(Minecraft client, LocalPlayer player) {
    float currentYaw = player.getYRot();
    float currentPitch = player.getXRot();

    if (CONFIG.isEnabled(ZenFeature.AIM_ASSIST)) {
      float actualYawChange = Mth.wrapDegrees(currentYaw - lastObservedYaw);
      float actualPitchChange = currentPitch - lastObservedPitch;
      float manualYaw = Math.abs(actualYawChange - lastAimAssistYawApplied);
      float manualPitch = Math.abs(actualPitchChange - lastAimAssistPitchApplied);
      double breakThreshold = CONFIG.aimAssistBreakSensitivity();
      if ((manualYaw > breakThreshold * 1.35D || manualPitch > breakThreshold * 1.35D) && (manualYaw > 0.15F || manualPitch > 0.15F)) {
        aimAssistSuppressedUntil = System.currentTimeMillis() + AIM_ASSIST_CANCEL_MS;
      }

      LivingEntity target = resolveAimAssistTarget(client, player);
      if (target != null && System.currentTimeMillis() > aimAssistSuppressedUntil) {
        Vec3 targetPoint = target.getBoundingBox().getCenter().add(0.0D, target.getBbHeight() * 0.25D, 0.0D);
        Vec3 toTarget = targetPoint.subtract(player.getEyePosition());
        double horizontal = Math.sqrt((toTarget.x * toTarget.x) + (toTarget.z * toTarget.z));
        float targetYaw = (float) (Mth.atan2(toTarget.z, toTarget.x) * (180.0D / Math.PI)) - 90.0F;
        float targetPitch = (float) (-(Mth.atan2(toTarget.y, horizontal) * (180.0D / Math.PI)));
        float yawDelta = Mth.wrapDegrees(targetYaw - currentYaw);
        float pitchDelta = Mth.wrapDegrees(targetPitch - currentPitch);
        float smoothing = (float) Mth.clamp(CONFIG.aimAssistSmoothness() * 1.15D, 0.08D, 0.65D);
        float maxYawStep = 9.0F;
        float maxPitchStep = 7.0F;
        lastAimAssistYawApplied = Mth.clamp(yawDelta * smoothing, -maxYawStep, maxYawStep);
        lastAimAssistPitchApplied = Mth.clamp(pitchDelta * smoothing, -maxPitchStep, maxPitchStep);

        player.setYRot(currentYaw + lastAimAssistYawApplied);
        player.setXRot(currentPitch + lastAimAssistPitchApplied);
        player.setYHeadRot(player.getYRot());
      } else {
        lastAimAssistYawApplied = 0.0F;
        lastAimAssistPitchApplied = 0.0F;
      }
    } else {
      aimAssistTargetId = -1;
      aimAssistTargetExpiresAt = 0L;
      aimAssistSuppressedUntil = 0L;
      lastAimAssistYawApplied = 0.0F;
      lastAimAssistPitchApplied = 0.0F;
    }

    lastObservedYaw = player.getYRot();
    lastObservedPitch = player.getXRot();
  }

  private LivingEntity resolveAimAssistTarget(Minecraft client, LocalPlayer player) {
    if (client.level == null) return null;

    LivingEntity remembered = null;
    Entity existing = client.level.getEntity(aimAssistTargetId);
    if (existing instanceof LivingEntity living
      && living.isAlive()
      && System.currentTimeMillis() <= aimAssistTargetExpiresAt
      && player.distanceToSqr(living) <= (CONFIG.aimAssistRange() * CONFIG.aimAssistRange())) {
      remembered = living;
    }

    LivingEntity best = remembered;
    double bestScore = remembered != null ? aimAssistScore(player, remembered) - 2.0D : Double.MAX_VALUE;

    for (Entity entity : client.level.entitiesForRendering()) {
      if (!(entity instanceof LivingEntity living)) continue;
      if (living == player || !living.isAlive()) continue;
      if (living instanceof Animal) continue;
      double maxRange = CONFIG.aimAssistRange();
      if (player.distanceToSqr(living) > maxRange * maxRange) continue;
      double score = aimAssistScore(player, living);
      if (score < bestScore) {
        best = living;
        bestScore = score;
      }
    }

    if (best != null) {
      aimAssistTargetId = best.getId();
      aimAssistTargetExpiresAt = System.currentTimeMillis() + AIM_ASSIST_TARGET_MS;
    }
    return best;
  }

  private double aimAssistScore(LocalPlayer player, LivingEntity target) {
    Vec3 targetPoint = target.getBoundingBox().getCenter().add(0.0D, target.getBbHeight() * 0.25D, 0.0D);
    Vec3 toTarget = targetPoint.subtract(player.getEyePosition());
    double horizontal = Math.sqrt((toTarget.x * toTarget.x) + (toTarget.z * toTarget.z));
    float targetYaw = (float) (Mth.atan2(toTarget.z, toTarget.x) * (180.0D / Math.PI)) - 90.0F;
    float targetPitch = (float) (-(Mth.atan2(toTarget.y, horizontal) * (180.0D / Math.PI)));
    double yawDelta = Math.abs(Mth.wrapDegrees(targetYaw - player.getYRot()));
    double pitchDelta = Math.abs(Mth.wrapDegrees(targetPitch - player.getXRot()));
    double distance = Math.sqrt(player.distanceToSqr(target));
    return (yawDelta * 1.7D) + (pitchDelta * 0.9D) + (distance * 1.25D);
  }

  private void maintainAntiFall(LocalPlayer player) {
    if (!CONFIG.isEnabled(ZenFeature.ANTI_FALL)) return;

    boolean normalFall = player.fallDistance > 2.0F;
    boolean flightDescent = CONFIG.isEnabled(ZenFeature.FLIGHT) && player.getDeltaMovement().y < -0.12D;
    if (!normalFall && !flightDescent) return;

    if (player.connection != null) {
      player.connection.send(new ServerboundMovePlayerPacket.StatusOnly(true, player.horizontalCollision));
    }
    player.resetFallDistance();

    if (player.getDeltaMovement().y < -0.7D) {
      player.setDeltaMovement(player.getDeltaMovement().x, -0.35D, player.getDeltaMovement().z);
    } else if (flightDescent && player.getDeltaMovement().y < -0.12D) {
      player.setDeltaMovement(player.getDeltaMovement().x, -0.08D, player.getDeltaMovement().z);
    }
  }

  private List<String> buildModules(Minecraft client) {
    LocalPlayer player = client.player;
    List<String> modules = new ArrayList<>();

    for (ZenFeature feature : CONFIG.orderedEnabledFeatures()) {
      String text = switch (feature) {
        case TPS_COUNTER -> buildTpsStatus();
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
        case TARGET_HEALTH -> buildDamageStatus();
        case ESP -> buildEspStatus();
        case TOGGLE_SPRINT -> "Toggle Sprint";
        case SPRINT_ASSIST -> "Sprint Assist";
        case SPEED_BOOST -> "Speed Boost";
        case AIR_JUMP -> "Air Jump";
        case SAFE_WALK -> "Safe Walk";
        case AUTO_WALK -> "Auto Walk";
        case NO_SLOW -> "No Slow";
        case SPIDER -> "Spider";
        case PARKOUR -> "Parkour";
        case AUTO_JUMP -> "Auto Jump";
        case NO_BOB -> "No Bob";
        case FOV_LOCK -> "FOV Lock";
        case FLIGHT -> buildFlightStatus();
        case AIM_ASSIST -> buildAimAssistStatus();
        case ANTI_FALL -> "Anti Fall";
        case PURE_FPS -> "Pure FPS";
        case TRACERS -> "Tracers";
        case NAME_TAGS -> "Name Tags";
        case ZOOM -> "Zoom";
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

  private String buildAimAssistStatus() {
    return format("Aim %.1fm %.2f", CONFIG.aimAssistRange(), CONFIG.aimAssistSmoothness());
  }

  private String buildTpsStatus() {
    String quality = estimatedServerTps >= 19.2D ? "Stable" : (estimatedServerTps >= 17.5D ? "OK" : "Low");
    return format("TPS %.2f %s", estimatedServerTps, quality);
  }

  private String buildDamageStatus() {
    if (lastTargetHealth < 0.0F && lastDamageDealt <= 0.0F) return "Damage --";
    if (lastDamageDealt > 0.0F) return format("Damage %.1f HP", lastDamageDealt);
    return format("Target %.1f HP", lastTargetHealth);
  }

  private String buildPing(Minecraft client) {
    int ping = currentPingValue(client);
    return ping < 0 ? "Ping --" : "Ping " + ping + "ms";
  }

  private int currentPingValue(Minecraft client) {
    if (client.getConnection() == null || client.player == null) return -1;
    var info = client.getConnection().getPlayerInfo(client.player.getUUID());
    if (info == null) return -1;
    return info.getLatency();
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

  private boolean hasSupportAhead(LocalPlayer player, double distance) {
    Vec3 look = player.getLookAngle();
    Vec3 flat = new Vec3(look.x, 0.0D, look.z);
    if (flat.lengthSqr() < 0.0001D) return true;
    Vec3 ahead = flat.normalize().scale(distance);
    BlockPos support = BlockPos.containing(player.getX() + ahead.x, player.getY() - 0.6D, player.getZ() + ahead.z);
    return !player.level().getBlockState(support).isAir();
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

  private void applyFlightMode(Minecraft client, LocalPlayer player, ZenFlightMode mode, float speed) {
    Vec3 movement = player.getDeltaMovement();
    boolean forward = player.input != null && player.input.hasForwardImpulse();
    Vec3 look = player.getLookAngle();
    Vec3 flat = new Vec3(look.x, 0.0D, look.z);
    Vec3 forwardBoost = flat.lengthSqr() > 0.0001D ? flat.normalize().scale(0.04D * speed) : Vec3.ZERO;

    switch (mode) {
      case VANILLA -> {
      }
      case DRIFT -> {
        double driftDown = client.options.keyShift.isDown() ? -0.18D * speed : -0.03D;
        player.setDeltaMovement(movement.x * 0.96D, Math.max(movement.y, driftDown), movement.z * 0.96D);
      }
      case DASH -> {
        if (forward) player.setDeltaMovement(movement.add(forwardBoost.scale(1.35D)));
      }
      case GLIDE -> {
        double glideY = client.options.keyShift.isDown() ? -0.08D : -0.02D;
        player.setDeltaMovement(movement.x, Math.max(movement.y, glideY), movement.z);
      }
      case HOVER -> {
        double vertical = 0.0D;
        if (client.options.keyJump.isDown()) vertical = 0.22D * speed;
        if (client.options.keyShift.isDown()) vertical = -0.22D * speed;
        player.setDeltaMovement(movement.x * 0.9D, vertical, movement.z * 0.9D);
      }
      case BOOST -> {
        if (forward) player.setDeltaMovement(movement.add(forwardBoost.scale(2.25D)));
        player.getAbilities().setFlyingSpeed(0.065F * speed);
      }
      case CRUISE -> {
        if (forward) player.setDeltaMovement(movement.add(forwardBoost.scale(0.95D)));
        else player.setDeltaMovement(movement.x * 0.98D, movement.y, movement.z * 0.98D);
      }
      case JET -> {
        double vertical = movement.y;
        if (client.options.keyJump.isDown()) vertical = 0.28D * speed;
        if (client.options.keyShift.isDown()) vertical = -0.28D * speed;
        Vec3 jet = forward ? movement.add(forwardBoost.scale(1.1D)) : movement;
        player.setDeltaMovement(jet.x, vertical, jet.z);
      }
      case BRAKE -> {
        player.setDeltaMovement(movement.x * 0.78D, movement.y * 0.65D, movement.z * 0.78D);
        player.getAbilities().setFlyingSpeed(0.035F * speed);
      }
      case SWIFT -> {
        if (forward) player.setDeltaMovement(movement.add(forwardBoost.scale(1.65D)));
        player.getAbilities().setFlyingSpeed(0.08F * speed);
      }
    }
  }
}
