package com.eddyplaysrizz467.zenclientmod;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;

public final class ZenTheme {
  public static final int WHITE = 0xFFFFFFFF;
  public static final int TEXT_SOFT = 0xFFD6F7D6;
  public static final int TEXT_MUTED = 0xFF91B891;
  public static final int PANEL_FILL = 0xD9041508;
  public static final int PANEL_HEADER = 0xF00A2A13;
  public static final int GREEN_BORDER = 0xFF2BEA64;
  public static final int GREEN_BORDER_SOFT = 0xAA15913C;
  public static final int CARD_OFF = 0xC4092410;
  public static final int CARD_ON = 0xDA0D3A1A;
  private static final int FIRE_DARK = 0x88208418;
  private static final int FIRE_MID = 0xAA2DDB42;
  private static final int FIRE_BRIGHT = 0xD65AFF83;
  private static final int FIRE_CORE = 0xE8D7FFD4;

  private ZenTheme() {
  }

  public static void renderGreenFireBackground(GuiGraphics context, int width, int height, float delta) {
    context.fill(0, 0, width, height, 0xFF020904);
    context.fill(0, 0, width, height, 0xAA06200D);
    context.fill(0, height / 2, width, height, 0x88255313);

    long frame = System.currentTimeMillis() / 70L;
    int cell = 8;
    for (int x = -cell; x < width + cell; x += cell) {
      int seed = Math.floorMod((x / cell) * 37, 97);
      int flameHeight = 30 + (int) (Math.abs(Math.sin((frame + seed) * 0.23D)) * 64.0D);
      flameHeight += (int) (Math.abs(Math.sin((frame * 0.41D) + seed)) * 28.0D);
      for (int y = 0; y < flameHeight; y += cell) {
        int yy = height - y - cell;
        int wave = (int) Math.round(Math.sin((frame + y + seed) * 0.35D) * 5.0D);
        int color;
        if (y < flameHeight * 0.28D) color = FIRE_CORE;
        else if (y < flameHeight * 0.58D) color = FIRE_BRIGHT;
        else if (y < flameHeight * 0.82D) color = FIRE_MID;
        else color = FIRE_DARK;
        context.fill(x + wave, yy, x + wave + cell + 2, yy + cell + 2, color);
      }
    }

    for (int band = 0; band < 4; band += 1) {
      int y = height - 80 - (band * 24);
      int alpha = 0x20 + (band * 0x10);
      context.fill(0, y, width, y + 24, (alpha << 24) | 0x00362012);
    }
  }

  public static void renderPanel(GuiGraphics context, int left, int top, int right, int bottom) {
    context.fill(left - 2, top - 2, right + 2, bottom + 2, GREEN_BORDER_SOFT);
    context.fill(left - 1, top - 1, right + 1, bottom + 1, 0xAA04280D);
    context.fill(left, top, right, bottom, PANEL_FILL);
    context.fill(left, top, right, top + 40, PANEL_HEADER);
    context.fill(left + 14, top + 46, right - 14, top + 47, 0x8841F572);
  }

  public static void renderOptionCard(GuiGraphics context, int left, int top, int right, int bottom, boolean enabled) {
    int border = enabled ? GREEN_BORDER : GREEN_BORDER_SOFT;
    int fill = enabled ? CARD_ON : CARD_OFF;
    context.fill(left, top, right, bottom, border);
    context.fill(left + 1, top + 1, right - 1, bottom - 1, fill);
    context.fill(left + 2, top + 2, right - 2, top + 3, enabled ? 0x8847FF79 : 0x5537B65A);
  }

  public static void renderSectionHeader(GuiGraphics context, Font font, String title, int left, int y, int width) {
    context.fill(left, y, left + width, y + 18, 0xA0062B10);
    context.fill(left, y + 17, left + width, y + 18, GREEN_BORDER_SOFT);
    drawOutlinedString(context, font, Component.literal(title), left + 8, y + 5, 0xFFE6FFE4, 0xFF0A4F20);
  }

  public static void drawOutlinedString(GuiGraphics context, Font font, Component text, int x, int y, int color, int outline) {
    context.drawString(font, text, x - 1, y, outline, false);
    context.drawString(font, text, x + 1, y, outline, false);
    context.drawString(font, text, x, y - 1, outline, false);
    context.drawString(font, text, x, y + 1, outline, false);
    context.drawString(font, text, x, y, color, false);
  }

  public static void drawCenteredOutlinedString(GuiGraphics context, Font font, Component text, int centerX, int y, int color, int outline) {
    drawOutlinedString(context, font, text, centerX - (font.width(text) / 2), y, color, outline);
  }
}
