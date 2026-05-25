package com.eddyplaysrizz467.zenclientmod;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

public final class ZenGreenButton extends Button {
  private ZenGreenButton(int x, int y, int width, int height, Component message, OnPress onPress) {
    super(x, y, width, height, message, onPress, DEFAULT_NARRATION);
  }

  public static ZenGreenButton create(Component message, OnPress onPress, int x, int y, int width, int height) {
    return new ZenGreenButton(x, y, width, height, message, onPress);
  }

  protected void renderContents(GuiGraphics context, int mouseX, int mouseY, float delta) {
    int left = getX();
    int top = getY();
    int right = left + getWidth();
    int bottom = top + getHeight();
    boolean hot = active && isHoveredOrFocused();
    int border = active ? (hot ? 0xFF7DFF96 : ZenTheme.GREEN_BORDER) : 0xFF1D6A31;
    int fill = active ? (hot ? 0xF0185C28 : 0xE00C3518) : 0xB0071D0D;

    context.fill(left, top, right, bottom, border);
    context.fill(left + 1, top + 1, right - 1, bottom - 1, fill);
    context.fill(left + 2, top + 2, right - 2, top + 3, hot ? 0x9966FF88 : 0x6640D66B);

    Font font = Minecraft.getInstance().font;
    int textColor = active ? ZenTheme.WHITE : 0xFF9DBC9D;
    ZenTheme.drawCenteredOutlinedString(
      context,
      font,
      getMessage(),
      left + (getWidth() / 2),
      top + ((getHeight() - 8) / 2),
      textColor,
      0xFF083910
    );
  }
}
