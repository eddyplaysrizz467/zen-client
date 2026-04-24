package com.eddyplaysrizz467.zenclientmod;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
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
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.EntityHitResult;

public final class ZenClientMod implements ClientModInitializer {
  private static final int MAX_VISIBLE_MODULES = 5;
  private static final long CLICK_WINDOW_MS = 1000L;
  private static final int FULLBRIGHT_NIGHT_VISION_DURATION = 1_000_000;
  private static final int HUD_BOX_PADDING = 4;
  private static final int HUD_BOX_HEIGHT = 18;
  private static final int HUD_BOX_GAP = 4;
  private static final int COMPASS_REFRESH_TICKS = 1;

  private static ZenConfig CONFIG;
  private static final Deque<Long> LEFT_CLICKS = new ArrayDeque<>();
  private static final Deque<Long> RIGHT_CLICKS = new ArrayDeque<>();
  private static final Deque<Double> SERVER_TPS_SAMPLES = new ArrayDeque<>();

  private static boolean lastAttackDown = false;
  private static boolean lastUseDown = false;
  private static long lastServerSampleAt = 0L;
  private static long lastWorldGameTime = Long.MIN_VALUE;
  private static double estimatedServerTps = 20.0D;
  private static int comboCount = 0;
  private static long lastComboAt = 0L;
  private static double lastReach = 0.0D;
  private static float lastTargetHealth = -1.0F;
  private static float previousGamma = 1.0F;
  private static boolean gammaBoostApplied = false;
  private static boolean addedZenNightVision = false;
  private static int hitPulseTicks = 0;
  private static int compassRefreshCooldown = 0;
  private static String compassLine = "Compass [N]";

  public static ZenConfig config() {
    return CONFIG;
  }

  @Override
  public void onInitializeClient() {
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
    if (client.player == null) {
      pruneClicks(System.currentTimeMillis());
      maintainFullbright(client, null);
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
    updateCompass(player);
    maintainFullbright(client, player);

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
    compassRefreshCooldown = 0;
    compassLine = "Compass [N]";
    gammaBoostApplied = false;
    addedZenNightVision = false;
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

    String text = compassLine;
    int textWidth = client.font.width(text);
    int centerX = client.getWindow().getGuiScaledWidth() / 2;
    int x = centerX - (textWidth / 2);
    int y = client.getWindow().getGuiScaledHeight() - 42;

    drawContext.fill(
      x - HUD_BOX_PADDING,
      y - HUD_BOX_PADDING,
      x + textWidth + HUD_BOX_PADDING,
      y + HUD_BOX_HEIGHT,
      0x8C050505
    );
    drawContext.drawString(client.font, Component.literal(text), x, y + 4, 0xFFFFFFFF, true);
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

  private void updateCompass(LocalPlayer player) {
    if (compassRefreshCooldown > 0) {
      compassRefreshCooldown -= 1;
      return;
    }

    float yaw = Mth.wrapDegrees(player.getYRot());
    String heading = headingFromYaw(yaw);
    String pointer = buildCompassPointer(yaw);
    compassLine = format("Compass %s %s %.1f°", pointer, heading, yaw);
    compassRefreshCooldown = COMPASS_REFRESH_TICKS;
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
        case COORDINATES -> format("XYZ %d %d %d", Mth.floor(player.getX()), Mth.floor(player.getY()), Mth.floor(player.getZ()));
        case DIRECTION -> "Facing " + player.getDirection().getName();
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
        case TOGGLE_SPRINT -> "Toggle Sprint";
        case SPRINT_ASSIST -> "Sprint Assist";
        case CLEAN_CROSSHAIR -> "Clean Crosshair";
        case HIT_COLOR -> "Hit Color Pulse";
        case FULLBRIGHT -> "Fullbright";
        case COMPASS -> null;
      };

      if (text != null && !text.isBlank()) modules.add(text);
    }

    return modules;
  }

  private String buildPing(Minecraft client) {
    if (client.getConnection() == null || client.player == null) return "Ping --";
    var info = client.getConnection().getPlayerInfo(client.player.getUUID());
    if (info == null) return "Ping --";
    return "Ping " + info.getLatency() + "ms";
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

  private String buildCompassPointer(float yaw) {
    String[] ring = {"N", "NE", "E", "SE", "S", "SW", "W", "NW"};
    float normalized = Mth.wrapDegrees(yaw + 180.0F);
    int center = Math.floorMod(Math.round(normalized / 45.0F), ring.length);
    StringBuilder out = new StringBuilder("[");
    for (int offset = -2; offset <= 2; offset++) {
      if (offset > -2) out.append(" ");
      String label = ring[Math.floorMod(center + offset, ring.length)];
      out.append(offset == 0 ? ">" + label + "<" : label);
    }
    out.append("]");
    return out.toString();
  }
}
