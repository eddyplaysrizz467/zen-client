package com.eddyplaysrizz467.zenclientmod;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenFriendsScreen extends Screen {
  private static final int PANEL_WIDTH = 430;
  private static final int ROW_HEIGHT = 32;
  private static final int SCROLL_STEP = 24;
  private static final int TOP_PADDING = 74;
  private static final int ENTRY_TOP = TOP_PADDING + 62;
  private static final int BOTTOM_PADDING = 48;

  private final Screen parent;
  private final List<Entry> entries = new ArrayList<>();
  private int scrollOffset = 0;
  private EditBox inviteBox;

  private static final class Entry {
    private final String name;
    private final String address;
    private final int baseY;
    private ZenGreenButton copyButton;
    private ZenGreenButton removeButton;

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
    int y = ENTRY_TOP;
    for (Map.Entry<String, String> friend : ZenClientMod.config().orderedFriendServers()) {
      entries.add(new Entry(friend.getKey(), friend.getValue(), y));
      y += ROW_HEIGHT + 8;
    }
  }

  private void rebuildFriendWidgets() {
    String typedInvite = inviteBox == null ? "" : inviteBox.getValue();
    clearWidgets();
    int panelLeft = (this.width - PANEL_WIDTH) / 2;
    int panelRight = panelLeft + PANEL_WIDTH;
    int visibleTop = ENTRY_TOP - 4;
    int visibleBottom = this.height - BOTTOM_PADDING - 8;

    String localAddress = ZenClientMod.currentLocalInvite(this.minecraft);
    String outsideAddress = ZenClientMod.currentPublicInvite();
    boolean hasLocalAddress = !localAddress.isBlank();
    boolean hasOutsideAddress = !outsideAddress.isBlank();
    boolean hasAnyAddress = hasLocalAddress || hasOutsideAddress;

    addRenderableWidget(ZenGreenButton.create(
        Component.literal(hasLocalAddress ? "Copy Wi-Fi" : "No Wi-Fi"),
        button -> ZenClientMod.copyToClipboard(this.minecraft, ZenClientMod.currentLocalInvite(this.minecraft)),
        panelLeft + 18, TOP_PADDING, 94, 20)).active = hasLocalAddress;

    addRenderableWidget(ZenGreenButton.create(
        Component.literal(hasOutsideAddress ? "Copy Outside" : "No Outside"),
        button -> ZenClientMod.copyToClipboard(this.minecraft, ZenClientMod.currentPublicInvite()),
        panelLeft + 116, TOP_PADDING, 104, 20)).active = hasOutsideAddress;

    addRenderableWidget(ZenGreenButton.create(
        Component.literal("Save Host"),
        button -> {
          String currentLocal = ZenClientMod.currentLocalInvite(this.minecraft);
          String currentOutside = ZenClientMod.currentPublicInvite();
          if (!currentLocal.isBlank()) {
            ZenClientMod.config().saveFriendServer("My hosted world (same Wi-Fi)", currentLocal);
          }
          if (!currentOutside.isBlank()) {
            ZenClientMod.config().saveFriendServer("My hosted world (outside Wi-Fi)", currentOutside);
          }
          if (!currentLocal.isBlank() || !currentOutside.isBlank()) {
            rebuildEntries();
            rebuildFriendWidgets();
          }
        },
        panelLeft + 224, TOP_PADDING, 86, 20)).active = hasAnyAddress;

    addRenderableWidget(ZenGreenButton.create(Component.literal("Back"), button -> this.minecraft.setScreen(parent), panelRight - 88, TOP_PADDING, 70, 20));

    inviteBox = new EditBox(this.font, panelLeft + 18, TOP_PADDING + 28, PANEL_WIDTH - 116, 20, Component.literal("Zen invite"));
    inviteBox.setHint(Component.literal("Paste server address"));
    inviteBox.setValue(typedInvite);
    addRenderableWidget(inviteBox);

    addRenderableWidget(ZenGreenButton.create(Component.literal("Join"), button -> ZenClientMod.joinZenInvite(this.minecraft, this, inviteBox.getValue()), panelRight - 88, TOP_PADDING + 28, 70, 20));

    for (Entry entry : entries) {
      int y = entry.baseY - scrollOffset;
      entry.copyButton = addRenderableWidget(ZenGreenButton.create(Component.literal("Copy"), button -> {
          ZenClientMod.copyToClipboard(this.minecraft, entry.address);
          button.setMessage(Component.literal("Copied"));
        }, panelRight - 196, y + 6, 52, 20));
      addRenderableWidget(ZenGreenButton.create(Component.literal("Join"), button -> ZenClientMod.joinZenInvite(this.minecraft, this, entry.address), panelRight - 138, y + 6, 54, 20)).visible = y + ROW_HEIGHT >= visibleTop && y <= visibleBottom;
      entry.removeButton = addRenderableWidget(ZenGreenButton.create(Component.literal("Remove"), button -> {
          ZenClientMod.config().removeFriendServer(entry.name);
          rebuildEntries();
          rebuildFriendWidgets();
        }, panelRight - 78, y + 6, 60, 20));

      boolean visible = y + ROW_HEIGHT >= visibleTop && y <= visibleBottom;
      entry.copyButton.visible = visible;
      entry.copyButton.active = visible;
      entry.removeButton.visible = visible;
      entry.removeButton.active = visible;
    }
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    ZenTheme.renderGreenFireBackground(context, this.width, this.height, delta);
    int panelLeft = (this.width - PANEL_WIDTH) / 2;
    int panelRight = panelLeft + PANEL_WIDTH;
    int panelTop = 22;
    int panelBottom = this.height - 24;
    ZenTheme.renderPanel(context, panelLeft, panelTop, panelRight, panelBottom);
    ZenTheme.drawCenteredOutlinedString(context, this.font, this.title, this.width / 2, panelTop + 12, ZenTheme.WHITE, 0xFF063711);

    String localAddress = ZenClientMod.currentLocalInvite(this.minecraft);
    String outsideAddress = ZenClientMod.currentPublicInvite();
    if (localAddress.isBlank() && outsideAddress.isBlank()) {
      ZenTheme.drawOutlinedString(context, this.font, Component.literal("Open a singleplayer world and press Host Zen LAN first."), panelLeft + 18, 54, ZenTheme.TEXT_MUTED, 0xFF063711);
    } else {
      String localText = localAddress.isBlank() ? "Same Wi-Fi: not open yet" : "Same Wi-Fi: " + localAddress;
      String outsideText = outsideAddress.isBlank() ? "Outside Wi-Fi: still checking" : "Outside Wi-Fi: " + outsideAddress;
      ZenTheme.drawOutlinedString(context, this.font, Component.literal(localText), panelLeft + 18, 50, 0xFFBFFFD2, 0xFF063711);
      ZenTheme.drawOutlinedString(context, this.font, Component.literal(outsideText), panelLeft + 18, 62, outsideAddress.isBlank() ? ZenTheme.TEXT_MUTED : 0xFFBFFFD2, 0xFF063711);
    }

    if (entries.isEmpty()) {
      ZenTheme.drawCenteredOutlinedString(context, this.font, Component.literal("Saved server addresses will show here."), this.width / 2, TOP_PADDING + 78, ZenTheme.TEXT_MUTED, 0xFF063711);
    } else {
      for (Entry entry : entries) {
        int y = entry.baseY - scrollOffset;
        int visibleTop = ENTRY_TOP - 4;
        int visibleBottom = this.height - BOTTOM_PADDING - 8;
        if (y + ROW_HEIGHT < visibleTop || y > visibleBottom) continue;
        ZenTheme.renderOptionCard(context, panelLeft + 18, y, panelRight - 18, y + ROW_HEIGHT, true);
        ZenTheme.drawOutlinedString(context, this.font, Component.literal(entry.name), panelLeft + 28, y + 6, ZenTheme.WHITE, 0xFF063711);
        ZenTheme.drawOutlinedString(context, this.font, Component.literal(entry.address), panelLeft + 28, y + 18, 0xFFB5D9BF, 0xFF063711);
      }
    }

    super.render(context, mouseX, mouseY, delta);

    if (maxScroll() > 0) {
      int trackTop = ENTRY_TOP - 4;
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
    int visibleHeight = (this.height - BOTTOM_PADDING - 8) - (ENTRY_TOP - 4);
    return Math.max(0, contentHeight - visibleHeight + 12);
  }

  private double visibleFraction() {
    int contentHeight = entries.size() * (ROW_HEIGHT + 8);
    int visibleHeight = (this.height - BOTTOM_PADDING - 8) - (ENTRY_TOP - 4);
    if (contentHeight <= 0) return 1.0D;
    return Math.min(1.0D, Math.max(0.15D, visibleHeight / (double) contentHeight));
  }
}
