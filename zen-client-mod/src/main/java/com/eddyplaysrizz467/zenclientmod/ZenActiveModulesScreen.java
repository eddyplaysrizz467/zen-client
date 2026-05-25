package com.eddyplaysrizz467.zenclientmod;

import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenActiveModulesScreen extends Screen {
  public ZenActiveModulesScreen() {
    super(Component.literal("Active Zen Modules"));
  }

  @Override
  protected void init() {
    addRenderableWidget(
      ZenGreenButton.create(Component.literal("Back"), button -> this.onClose(), (this.width / 2) - 68, this.height - 34, 136, 20)
    );
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    ZenTheme.renderGreenFireBackground(context, this.width, this.height, delta);

    int panelLeft = (this.width / 2) - 230;
    int panelRight = (this.width / 2) + 230;
    int panelTop = 18;
    int panelBottom = this.height - 48;
    ZenTheme.renderPanel(context, panelLeft, panelTop, panelRight, panelBottom);

    super.render(context, mouseX, mouseY, delta);

    ZenTheme.drawCenteredOutlinedString(context, this.font, this.title, this.width / 2, 28, ZenTheme.WHITE, 0xFF063711);
    ZenTheme.drawCenteredOutlinedString(context, this.font, Component.literal("Opened with Ctrl+P"), this.width / 2, 46, ZenTheme.TEXT_SOFT, 0xFF063711);

    List<String> modules = ZenClientMod.activeModuleLines(this.minecraft);
    if (modules.isEmpty()) {
      ZenTheme.drawCenteredOutlinedString(context, this.font, Component.literal("No Zen modules are active right now."), this.width / 2, 84, ZenTheme.TEXT_MUTED, 0xFF063711);
      return;
    }

    int y = 76;
    for (int i = 0; i < modules.size(); i++) {
      String text = modules.get(i);
      int top = y + (i * 22);
      ZenTheme.renderOptionCard(context, panelLeft + 18, top - 2, panelRight - 18, top + 18, true);
      ZenTheme.drawOutlinedString(context, this.font, Component.literal((i + 1) + ". " + text), panelLeft + 28, top + 3, ZenTheme.WHITE, 0xFF063711);
    }
  }

  @Override
  public void onClose() {
    if (this.minecraft != null) this.minecraft.setScreen(null);
  }
}
