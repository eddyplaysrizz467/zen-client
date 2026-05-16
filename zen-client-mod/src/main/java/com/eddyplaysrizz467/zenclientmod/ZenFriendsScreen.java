package com.eddyplaysrizz467.zenclientmod;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.network.chat.Component;

public final class ZenFriendsScreen extends Screen {
  private static final int PANEL_WIDTH = 430;
  private static final int ROW_HEIGHT = 32;
  private static final int SCROLL_STEP = 24;
  private static final int TOP_PADDING = 74;
  private static final int BOTTOM_PADDING = 48;

  private final Screen parent;
  private final List<Entry> entries = new ArrayList<>();
  private int scrollOffset = 0;

  private static final class Entry {
    private final String name;
    private final String address;
    private final int baseY;
    private Button copyButton;
    private Button removeButton;

    private Entry(String name, String address, int baseY) {
      this.name = name;
      this.address = address;
      this.baseY = baseY;
    }
  }

  public ZenFriendsScreen(Screen parent) {
    super(Component.literal("Zen Friends"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    rebuildEntries();
    rebuildFriendWidgets();
  }

  private void rebuildEntries() {
    entries.clear();
    int y = TOP_PADDING + 56;
    for (Map.Entry<String, String> friend : ZenClientMod.config().orderedFriendServers()) {
      entries.add(new Entry(friend.getKey(), friend.getValue(), y));
      y += ROW_HEIGHT + 8;
    }
  }

  private void rebuildFriendWidgets() {
    clearWidgets();
    int panelLeft = (this.width - PANEL_WIDTH) / 2;
    int panelRight = panelLeft + PANEL_WIDTH;
    int visibleTop = TOP_PADDING + 44;
    int visibleBottom = this.height - BOTTOM_PADDING - 8;

    String invite = ZenClientMod.currentLanInvite(this.minecraft);
    boolean hasInvite = !invite.isBlank();

    addRenderableWidget(Button.builder(
        Component.literal(hasInvite ? "Copy Current Invite" : "No Hosted World"),
        button -> ZenClientMod.copyToClipboard(this.minecraft, ZenClientMod.currentLanInvite(this.minecraft)))
      .bounds(panelLeft + 18, TOP_PADDING, 150, 20)
      .build()).active = hasInvite;

    addRenderableWidget(Button.builder(
        Component.literal("Save Current Host"),
        button -> {
          String currentInvite = ZenClientMod.currentLanInvite(this.minecraft);
          if (!currentInvite.isBlank()) {
            ZenClientMod.config().saveFriendServer("My hosted world", currentInvite);
            rebuildEntries();
            rebuildFriendWidgets();
          }
        })
      .bounds(panelLeft + 176, TOP_PADDING, 132, 20)
      .build()).active = hasInvite;

    addRenderableWidget(Button.builder(Component.literal("Back"), button -> this.minecraft.setScreen(parent))
      .bounds(panelRight - 88, TOP_PADDING, 70, 20)
      .build());

    for (Entry entry : entries) {
      int y = entry.baseY - scrollOffset;
      entry.copyButton = addRenderableWidget(Button.builder(Component.literal("Copy"), button -> {
          ZenClientMod.copyToClipboard(this.minecraft, entry.address);
          button.setMessage(Component.literal("Copied"));
        })
        .bounds(panelRight - 142, y + 6, 58, 20)
        .build());
      entry.removeButton = addRenderableWidget(Button.builder(Component.literal("Remove"), button -> {
          ZenClientMod.config().removeFriendServer(entry.name);
          rebuildEntries();
          rebuildFriendWidgets();
        })
        .bounds(panelRight - 78, y + 6, 60, 20)
        .build());

      boolean visible = y + ROW_HEIGHT >= visibleTop && y <= visibleBottom;
      entry.copyButton.visible = visible;
      entry.copyButton.active = visible;
      entry.removeButton.visible = visible;
      entry.removeButton.active = visible;
    }
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    int panelLeft = (this.width - PANEL_WIDTH) / 2;
    int panelRight = panelLeft + PANEL_WIDTH;
    int panelTop = 22;
    int panelBottom = this.height - 24;
    context.fill(panelLeft - 1, panelTop - 1, panelRight + 1, panelBottom + 1, 0xAA2B3A31);
    context.fill(panelLeft, panelTop, panelRight, panelBottom, 0xE0080F0B);
    context.fill(panelLeft, panelTop, panelRight, panelTop + 38, 0xF0122118);
    context.drawCenteredString(this.font, this.title, this.width / 2, panelTop + 12, 0xFFFFFFFF);

    String invite = ZenClientMod.currentLanInvite(this.minecraft);
    String inviteText = invite.isBlank() ? "Open a singleplayer world and press Host Zen LAN first." : "Current invite: " + invite;
    context.drawString(this.font, inviteText, panelLeft + 18, 54, invite.isBlank() ? 0xFFB7B7B7 : 0xFFBFFFD2, false);

    if (entries.isEmpty()) {
      context.drawCenteredString(this.font, Component.literal("Saved friend invites will show here."), this.width / 2, TOP_PADDING + 78, 0xFF909790);
    } else {
      for (Entry entry : entries) {
        int y = entry.baseY - scrollOffset;
        int visibleTop = TOP_PADDING + 44;
        int visibleBottom = this.height - BOTTOM_PADDING - 8;
        if (y + ROW_HEIGHT < visibleTop || y > visibleBottom) continue;
        context.fill(panelLeft + 18, y, panelRight - 18, y + ROW_HEIGHT, 0x5523382C);
        context.drawString(this.font, entry.name, panelLeft + 28, y + 6, 0xFFFFFFFF, false);
        context.drawString(this.font, entry.address, panelLeft + 28, y + 18, 0xFFB5D9BF, false);
      }
    }

    super.render(context, mouseX, mouseY, delta);

    if (maxScroll() > 0) {
      int trackTop = TOP_PADDING + 44;
      int trackBottom = this.height - BOTTOM_PADDING - 8;
      int trackX = panelRight - 10;
      context.fill(trackX, trackTop, trackX + 4, trackBottom, 0x55303036);
      int trackHeight = Math.max(20, trackBottom - trackTop);
      int thumbHeight = Math.max(24, (int) (trackHeight * visibleFraction()));
      int thumbTravel = Math.max(0, trackHeight - thumbHeight);
      int thumbY = trackTop + (int) Math.round((scrollOffset / (double) maxScroll()) * thumbTravel);
      context.fill(trackX, thumbY, trackX + 4, thumbY + thumbHeight, 0xFFBFFFD2);
    }
  }

  @Override
  public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
    if (maxScroll() <= 0) return false;
    scrollOffset = Math.max(0, Math.min(maxScroll(), scrollOffset - (int) Math.round(verticalAmount * SCROLL_STEP)));
    rebuildFriendWidgets();
    return true;
  }

  @Override
  public void onClose() {
    Minecraft.getInstance().setScreen(parent);
  }

  private int maxScroll() {
    int contentHeight = entries.size() * (ROW_HEIGHT + 8);
    int visibleHeight = (this.height - BOTTOM_PADDING - 8) - (TOP_PADDING + 44);
    return Math.max(0, contentHeight - visibleHeight + 12);
  }

  private double visibleFraction() {
    int contentHeight = entries.size() * (ROW_HEIGHT + 8);
    int visibleHeight = (this.height - BOTTOM_PADDING - 8) - (TOP_PADDING + 44);
    if (contentHeight <= 0) return 1.0D;
    return Math.min(1.0D, Math.max(0.15D, visibleHeight / (double) contentHeight));
  }
}
