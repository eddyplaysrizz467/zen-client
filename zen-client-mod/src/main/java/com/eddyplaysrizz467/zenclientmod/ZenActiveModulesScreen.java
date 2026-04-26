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
      Button.builder(Component.literal("Back"), button -> this.onClose())
        .bounds((this.width / 2) - 68, this.height - 34, 136, 20)
        .build()
    );
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    this.renderBackground(context, mouseX, mouseY, delta);

    int panelLeft = (this.width / 2) - 230;
    int panelRight = (this.width / 2) + 230;
    int panelTop = 18;
    int panelBottom = this.height - 48;
    context.fill(panelLeft, panelTop, panelRight, panelBottom, 0xCC090909);
    context.fill(panelLeft, panelTop, panelRight, panelTop + 34, 0xE1121212);

    super.render(context, mouseX, mouseY, delta);

    context.drawCenteredString(this.font, this.title, this.width / 2, 28, 0xFFFFFFFF);
    context.drawCenteredString(this.font, Component.literal("Opened with Ctrl+P"), this.width / 2, 46, 0xFF9E9E9E);

    List<String> modules = ZenClientMod.activeModuleLines(this.minecraft);
    if (modules.isEmpty()) {
      context.drawCenteredString(this.font, Component.literal("No Zen modules are active right now."), this.width / 2, 84, 0xFFB0B0B0);
      return;
    }

    int y = 76;
    for (int i = 0; i < modules.size(); i++) {
      String text = modules.get(i);
      int top = y + (i * 22);
      context.fill(panelLeft + 18, top - 2, panelRight - 18, top + 16, 0x74202020);
      context.drawString(this.font, Component.literal((i + 1) + ". " + text), panelLeft + 28, top + 2, 0xFFFFFFFF, true);
    }
  }

  @Override
  public void onClose() {
    if (this.minecraft != null) this.minecraft.setScreen(null);
  }
}
