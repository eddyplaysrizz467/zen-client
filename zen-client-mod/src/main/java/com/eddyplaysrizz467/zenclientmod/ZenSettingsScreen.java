package com.eddyplaysrizz467.zenclientmod;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenSettingsScreen extends Screen {
  private static final int BUTTON_HEIGHT = 20;
  private static final int COLUMN_WIDTH = 232;
  private static final int COLUMN_GAP = 14;
  private static final int ROW_HEIGHT = 40;
  private static final int SECTION_HEADER_HEIGHT = 18;
  private static final int SECTION_GAP = 16;
  private static final int SCROLL_STEP = 26;
  private static final int CONTENT_START_Y = 78;
  private static final int PANEL_TOP = 18;
  private static final int PANEL_BOTTOM_MARGIN = 48;
  private static final int PANEL_PADDING = 18;

  private final Screen parent;
  private final List<Entry> entries = new ArrayList<>();
  private final List<SectionHeader> sectionHeaders = new ArrayList<>();
  private ZenGreenButton backButton;
  private int scrollOffset = 0;
  private int contentBottomY = CONTENT_START_Y;

  private static final class Entry {
    private final ZenFeature feature;
    private final int x;
    private final int baseY;
    private final int width;
    private final int mainWidth;
    private ZenGreenButton toggleButton;
    private ZenGreenButton auxButton;

    private Entry(ZenFeature feature, int x, int baseY, int width, int mainWidth) {
      this.feature = feature;
      this.x = x;
      this.baseY = baseY;
      this.width = width;
      this.mainWidth = mainWidth;
    }
  }

  private static final class SectionHeader {
    private final String title;
    private final int baseY;

    private SectionHeader(String title, int baseY) {
      this.title = title;
      this.baseY = baseY;
    }
  }

  public ZenSettingsScreen(Screen parent) {
    super(Component.literal("Zen Client Settings"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    entries.clear();
    sectionHeaders.clear();

    int leftX = (this.width / 2) - COLUMN_WIDTH - (COLUMN_GAP / 2);
    int rightX = (this.width / 2) + (COLUMN_GAP / 2);
    int cursorY = CONTENT_START_Y;

    cursorY = layoutSection("HUD & Info", cursorY, leftX, rightX,
      ZenFeature.TPS_COUNTER, ZenFeature.FPS_COUNTER, ZenFeature.PING_COUNTER, ZenFeature.COORDINATES,
      ZenFeature.CLOCK, ZenFeature.DAY_COUNTER, ZenFeature.BIOME, ZenFeature.SPEED,
      ZenFeature.LIGHT_LEVEL, ZenFeature.DIRECTION, ZenFeature.COMPASS, ZenFeature.HELD_DURABILITY,
      ZenFeature.SNEAK_STATUS
    );
    cursorY = layoutSection("Combat Readouts", cursorY, leftX, rightX,
      ZenFeature.CPS_COUNTER, ZenFeature.COMBO_COUNTER, ZenFeature.REACH_DISPLAY, ZenFeature.BOW_CHARGE,
      ZenFeature.PEARL_TIMER, ZenFeature.ARROW_COUNT, ZenFeature.ARMOR_STATUS, ZenFeature.POTION_STATUS,
      ZenFeature.TARGET_HEALTH, ZenFeature.AIM_ASSIST, ZenFeature.ANTI_FALL
    );
    cursorY = layoutSection("Movement", cursorY, leftX, rightX,
      ZenFeature.TOGGLE_SPRINT, ZenFeature.SPRINT_ASSIST, ZenFeature.SPEED_BOOST, ZenFeature.AIR_JUMP,
      ZenFeature.SAFE_WALK, ZenFeature.AUTO_WALK, ZenFeature.NO_SLOW, ZenFeature.SPIDER,
      ZenFeature.PARKOUR, ZenFeature.AUTO_JUMP, ZenFeature.FLIGHT
    );
    cursorY = layoutSection("Visuals", cursorY, leftX, rightX,
      ZenFeature.ESP, ZenFeature.TRACERS, ZenFeature.NAME_TAGS, ZenFeature.ZOOM,
      ZenFeature.CLEAN_CROSSHAIR, ZenFeature.HIT_COLOR, ZenFeature.FULLBRIGHT,
      ZenFeature.NO_BOB, ZenFeature.FOV_LOCK
    );
    cursorY = layoutSection("Performance", cursorY, leftX, rightX, ZenFeature.PURE_FPS);

    contentBottomY = cursorY;
    scrollOffset = clampScroll(scrollOffset);
    refreshEntryWidgets();
  }

  private int layoutSection(String title, int startY, int leftX, int rightX, ZenFeature... features) {
    sectionHeaders.add(new SectionHeader(title, startY));
    int featureStartY = startY + SECTION_HEADER_HEIGHT + 8;
    for (int i = 0; i < features.length; i++) {
      ZenFeature feature = features[i];
      int column = i % 2;
      int row = i / 2;
      int x = column == 0 ? leftX : rightX;
      int y = featureStartY + (row * ROW_HEIGHT);
      int mainWidth = hasSubSettings(feature) ? COLUMN_WIDTH - 72 : COLUMN_WIDTH;
      entries.add(new Entry(feature, x, y, COLUMN_WIDTH, mainWidth));
    }
    int rows = (features.length + 1) / 2;
    return featureStartY + (rows * ROW_HEIGHT) + SECTION_GAP;
  }

  private void refreshEntryWidgets() {
    clearWidgets();

    int contentTop = PANEL_TOP + 42 + PANEL_PADDING;
    int contentBottom = this.height - PANEL_BOTTOM_MARGIN - PANEL_PADDING;

    for (Entry entry : entries) {
      int y = entry.baseY - scrollOffset;
      entry.toggleButton = addRenderableWidget(
        ZenGreenButton.create(buildButtonText(entry.feature), button -> {
          ZenClientMod.config().toggle(entry.feature);
          button.setMessage(buildButtonText(entry.feature));
        }, entry.x, y, entry.mainWidth, BUTTON_HEIGHT)
      );

      if (hasSubSettings(entry.feature)) {
        String configLabel = entry.feature == ZenFeature.ESP ? "Targets" : "Tune";
        entry.auxButton = addRenderableWidget(
          ZenGreenButton.create(Component.literal(configLabel), button -> this.minecraft.setScreen(
            switch (entry.feature) {
              case ESP -> new ZenEspScreen(this);
              case FLIGHT -> new ZenFlightScreen(this);
              case AIM_ASSIST -> new ZenAimAssistScreen(this);
              default -> this;
            }
          ), entry.x + entry.mainWidth + 8, y, 64, BUTTON_HEIGHT)
        );
      } else {
        entry.auxButton = null;
      }

      boolean visible = y + ROW_HEIGHT >= contentTop && y <= contentBottom;
      entry.toggleButton.visible = visible;
      entry.toggleButton.active = visible;
      if (entry.auxButton != null) {
        entry.auxButton.visible = visible;
        entry.auxButton.active = visible;
      }
    }

    backButton = addRenderableWidget(
      ZenGreenButton.create(Component.literal("Back"), button -> this.minecraft.setScreen(parent), (this.width / 2) - 68, this.height - 34, 136, 20)
    );
  }

  private static boolean hasSubSettings(ZenFeature feature) {
    return feature == ZenFeature.ESP || feature == ZenFeature.FLIGHT || feature == ZenFeature.AIM_ASSIST;
  }

  private Component buildButtonText(ZenFeature feature) {
    boolean enabled = ZenClientMod.config().isEnabled(feature);
    String state = enabled ? "ON" : "OFF";
    return Component.literal(feature.label() + "  [" + state + "]");
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    ZenTheme.renderGreenFireBackground(context, this.width, this.height, delta);

    int panelLeft = (this.width / 2) - 292;
    int panelRight = (this.width / 2) + 292;
    int panelTop = PANEL_TOP;
    int panelBottom = this.height - PANEL_BOTTOM_MARGIN;
    ZenTheme.renderPanel(context, panelLeft, panelTop, panelRight, panelBottom);

    int contentTop = PANEL_TOP + 42 + PANEL_PADDING;
    int contentBottom = this.height - PANEL_BOTTOM_MARGIN - PANEL_PADDING;
    for (SectionHeader header : sectionHeaders) {
      int y = header.baseY - scrollOffset;
      if (y + SECTION_HEADER_HEIGHT < contentTop || y > contentBottom) continue;
      ZenTheme.renderSectionHeader(context, this.font, header.title, panelLeft + 18, y, panelRight - panelLeft - 36);
    }

    for (Entry entry : entries) {
      int y = entry.baseY - scrollOffset;
      int descY = y + BUTTON_HEIGHT + 3;
      if (descY + this.font.lineHeight < contentTop || descY > contentBottom) continue;
      int rowLeft = entry.x - 4;
      int rowRight = entry.x + entry.width + 4;
      int rowTop = y - 4;
      int rowBottom = y + ROW_HEIGHT - 4;
      ZenTheme.renderOptionCard(context, rowLeft, rowTop, rowRight, rowBottom, ZenClientMod.config().isEnabled(entry.feature));
    }

    super.render(context, mouseX, mouseY, delta);

    ZenTheme.drawCenteredOutlinedString(context, this.font, this.title, this.width / 2, 28, ZenTheme.WHITE, 0xFF063711);
    ZenTheme.drawCenteredOutlinedString(
      context,
      this.font,
      Component.literal("Grouped Zen modules with green fire styling"),
      this.width / 2,
      48,
      ZenTheme.TEXT_SOFT,
      0xFF063711
    );

    for (Entry entry : entries) {
      int y = entry.baseY - scrollOffset;
      int descY = y + BUTTON_HEIGHT + 3;
      if (descY + this.font.lineHeight < contentTop || descY > contentBottom) continue;
      int descColor = ZenClientMod.config().isEnabled(entry.feature) ? 0xFFCDFDD0 : ZenTheme.TEXT_MUTED;
      String description = trimToWidth(descriptionFor(entry.feature), entry.width - 8);
      ZenTheme.drawOutlinedString(context, this.font, Component.literal(description), entry.x + 2, descY, descColor, 0xFF062C0E);
    }

    if (maxScroll() > 0) {
      int trackTop = PANEL_TOP + 60;
      int trackBottom = this.height - PANEL_BOTTOM_MARGIN - 18;
      int trackX = panelRight - 11;
      context.fill(trackX, trackTop, trackX + 5, trackBottom, 0x66307132);

      int trackHeight = Math.max(20, trackBottom - trackTop);
      int thumbHeight = Math.max(28, (int) (trackHeight * visibleFraction()));
      int thumbTravel = Math.max(0, trackHeight - thumbHeight);
      int thumbY = trackTop + (int) Math.round((scrollOffset / (double) maxScroll()) * thumbTravel);
      context.fill(trackX, thumbY, trackX + 5, thumbY + thumbHeight, 0xFF65FF83);
    }
  }

  private String descriptionFor(ZenFeature feature) {
    return switch (feature) {
      case ESP -> feature.description() + " Use Targets to choose what glows.";
      case FLIGHT -> feature.description() + " Use Tune to adjust mode and speed.";
      case AIM_ASSIST -> feature.description() + " Use Tune to adjust range and smoothness.";
      default -> feature.description();
    };
  }

  private String trimToWidth(String value, int maxWidth) {
    if (this.font.width(value) <= maxWidth) return value;
    String text = value;
    while (text.length() > 4 && this.font.width(text + "...") > maxWidth) {
      text = text.substring(0, text.length() - 1);
    }
    return text + "...";
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
    int contentHeight = contentBottomY - CONTENT_START_Y;
    int visibleHeight = (this.height - PANEL_BOTTOM_MARGIN - PANEL_PADDING) - CONTENT_START_Y;
    return Math.max(0, contentHeight - visibleHeight + 12);
  }

  private int clampScroll(int value) {
    return Math.max(0, Math.min(maxScroll(), value));
  }

  private double visibleFraction() {
    int contentHeight = contentBottomY - CONTENT_START_Y;
    int visibleHeight = (this.height - PANEL_BOTTOM_MARGIN - PANEL_PADDING) - CONTENT_START_Y;
    if (contentHeight <= 0) return 1.0D;
    return Math.min(1.0D, Math.max(0.15D, visibleHeight / (double) contentHeight));
  }
}
