package com.eddyplaysrizz467.zenclientmod;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenSettingsScreen extends Screen {
  private static final int BUTTON_HEIGHT = 20;
  private static final int COLUMN_WIDTH = 232;
  private static final int COLUMN_GAP = 14;
  private static final int ROW_HEIGHT = 38;
  private static final int SCROLL_STEP = 24;
  private static final int CONTENT_START_Y = 72;
  private static final int PANEL_TOP = 18;
  private static final int PANEL_BOTTOM_MARGIN = 48;
  private static final int PANEL_PADDING = 18;

  private final Screen parent;
  private final List<Entry> entries = new ArrayList<>();
  private Button backButton;
  private int scrollOffset = 0;

  private static final class Entry {
    private final ZenFeature feature;
    private final int x;
    private final int baseY;
    private final int width;
    private final int mainWidth;
    private Button toggleButton;
    private Button auxButton;

    private Entry(ZenFeature feature, int x, int baseY, int width, int mainWidth) {
      this.feature = feature;
      this.x = x;
      this.baseY = baseY;
      this.width = width;
      this.mainWidth = mainWidth;
    }
  }

  public ZenSettingsScreen(Screen parent) {
    super(Component.literal("Zen Client Settings"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    entries.clear();

    int leftX = (this.width / 2) - COLUMN_WIDTH - (COLUMN_GAP / 2);
    int rightX = (this.width / 2) + (COLUMN_GAP / 2);

    ZenFeature[] features = ZenFeature.values();
    for (int i = 0; i < features.length; i++) {
      ZenFeature feature = features[i];
      int column = i % 2;
      int row = i / 2;
      int x = column == 0 ? leftX : rightX;
      int y = CONTENT_START_Y + (row * ROW_HEIGHT);
      int mainWidth = (feature == ZenFeature.ESP || feature == ZenFeature.FLIGHT || feature == ZenFeature.AIM_ASSIST) ? COLUMN_WIDTH - 72 : COLUMN_WIDTH;
      entries.add(new Entry(feature, x, y, COLUMN_WIDTH, mainWidth));
    }

    refreshEntryWidgets();
  }

  private void refreshEntryWidgets() {
    clearWidgets();

    int contentTop = PANEL_TOP + 34 + PANEL_PADDING;
    int contentBottom = this.height - PANEL_BOTTOM_MARGIN - PANEL_PADDING;

    for (Entry entry : entries) {
      int y = entry.baseY - scrollOffset;
      entry.toggleButton = addRenderableWidget(
        Button.builder(buildButtonText(entry.feature), button -> {
          ZenClientMod.config().toggle(entry.feature);
          button.setMessage(buildButtonText(entry.feature));
        }).bounds(entry.x, y, entry.mainWidth, BUTTON_HEIGHT).build()
      );

      if (entry.feature == ZenFeature.ESP || entry.feature == ZenFeature.FLIGHT || entry.feature == ZenFeature.AIM_ASSIST) {
        String configLabel = entry.feature == ZenFeature.ESP ? "Targets" : "Tune";
        entry.auxButton = addRenderableWidget(
          Button.builder(Component.literal(configLabel), button -> this.minecraft.setScreen(
            switch (entry.feature) {
              case ESP -> new ZenEspScreen(this);
              case FLIGHT -> new ZenFlightScreen(this);
              case AIM_ASSIST -> new ZenAimAssistScreen(this);
              default -> this;
            }
          ))
            .bounds(entry.x + entry.mainWidth + 8, y, 64, BUTTON_HEIGHT)
            .build()
        );
      } else {
        entry.auxButton = null;
      }

      boolean visible = y + BUTTON_HEIGHT >= contentTop && y <= contentBottom;
      entry.toggleButton.visible = visible;
      entry.toggleButton.active = visible;
      if (entry.auxButton != null) {
        entry.auxButton.visible = visible;
        entry.auxButton.active = visible;
      }
    }

    backButton = addRenderableWidget(
      Button.builder(Component.literal("Back"), button -> this.minecraft.setScreen(parent))
        .bounds((this.width / 2) - 68, this.height - 34, 136, 20)
        .build()
    );
  }

  private Component buildButtonText(ZenFeature feature) {
    boolean enabled = ZenClientMod.config().isEnabled(feature);
    String state = enabled ? "ON" : "OFF";
    return Component.literal(feature.label() + "  [" + state + "]");
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    int panelLeft = (this.width / 2) - 250;
    int panelRight = (this.width / 2) + 250;
    int panelTop = PANEL_TOP;
    int panelBottom = this.height - PANEL_BOTTOM_MARGIN;
    context.fill(panelLeft, panelTop, panelRight, panelBottom, 0xCC090909);
    context.fill(panelLeft, panelTop, panelRight, panelTop + 34, 0xE1121212);
    context.fill(panelLeft + 18, panelTop + 44, panelRight - 18, panelTop + 45, 0x332E2E2E);

    super.render(context, mouseX, mouseY, delta);

    context.drawCenteredString(this.font, this.title, this.width / 2, 28, 0xFFFFFFFF);
    context.drawCenteredString(
      this.font,
      Component.literal(ZenFeature.values().length + " live PvP/QoL modules for Zen Client"),
      this.width / 2,
      46,
      0xFF9E9E9E
    );

    for (Entry entry : entries) {
      int y = entry.baseY - scrollOffset;
      int descY = y + BUTTON_HEIGHT + 2;
      int contentTop = PANEL_TOP + 34 + PANEL_PADDING;
      int contentBottom = this.height - PANEL_BOTTOM_MARGIN - PANEL_PADDING;
      if (descY + this.font.lineHeight < contentTop || descY > contentBottom) continue;
      int descColor = ZenClientMod.config().isEnabled(entry.feature) ? 0xFFBEE8C3 : 0xFF8D8D8D;
      String description = switch (entry.feature) {
        case ESP -> entry.feature.description() + " Use Targets to choose what glows.";
        case FLIGHT -> entry.feature.description() + " Use Tune to adjust mode and speed.";
        case AIM_ASSIST -> entry.feature.description() + " Use Tune to adjust range and smoothness.";
        default -> entry.feature.description();
      };
      context.drawString(this.font, Component.literal(description), entry.x + 2, descY, descColor, false);
    }

    if (maxScroll() > 0) {
      int trackTop = PANEL_TOP + 52;
      int trackBottom = this.height - PANEL_BOTTOM_MARGIN - 18;
      int trackX = panelRight - 10;
      context.fill(trackX, trackTop, trackX + 4, trackBottom, 0x55303030);

      int trackHeight = Math.max(20, trackBottom - trackTop);
      int thumbHeight = Math.max(28, (int) (trackHeight * visibleFraction()));
      int thumbTravel = Math.max(0, trackHeight - thumbHeight);
      int thumbY = trackTop + (int) Math.round((scrollOffset / (double) maxScroll()) * thumbTravel);
      context.fill(trackX, thumbY, trackX + 4, thumbY + thumbHeight, 0xFFBDBDBD);
    }
  }

  @Override
  public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
    if (maxScroll() <= 0) return false;
    scrollOffset = clampScroll(scrollOffset - (int) Math.round(verticalAmount * SCROLL_STEP));
    refreshEntryWidgets();
    return true;
  }

  @Override
  public void onClose() {
    this.minecraft.setScreen(parent);
  }

  private int maxScroll() {
    int rows = (ZenFeature.values().length + 1) / 2;
    int contentHeight = rows * ROW_HEIGHT;
    int visibleHeight = (this.height - PANEL_BOTTOM_MARGIN - PANEL_PADDING) - CONTENT_START_Y;
    return Math.max(0, contentHeight - visibleHeight + 12);
  }

  private int clampScroll(int value) {
    return Math.max(0, Math.min(maxScroll(), value));
  }

  private double visibleFraction() {
    int rows = (ZenFeature.values().length + 1) / 2;
    int contentHeight = rows * ROW_HEIGHT;
    int visibleHeight = (this.height - PANEL_BOTTOM_MARGIN - PANEL_PADDING) - CONTENT_START_Y;
    if (contentHeight <= 0) return 1.0D;
    return Math.min(1.0D, Math.max(0.15D, visibleHeight / (double) contentHeight));
  }
}
