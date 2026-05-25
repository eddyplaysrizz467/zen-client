package com.eddyplaysrizz467.zenclientmod;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;

public final class ZenFriendlyPlayersScreen extends Screen {
  private final Screen parent;

  public ZenFriendlyPlayersScreen(Screen parent) {
    super(Component.literal("Friendly Players"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    int columnWidth = 220;
    int gap = 12;
    int leftX = (this.width / 2) - columnWidth - (gap / 2);
    int rightX = (this.width / 2) + (gap / 2);
    int startY = 72;

    List<String> names = collectCandidateNames();
    for (int i = 0; i < names.size(); i++) {
      String name = names.get(i);
      int column = i % 2;
      int row = i / 2;
      int x = column == 0 ? leftX : rightX;
      int y = startY + (row * 28);

      addRenderableWidget(
        ZenGreenButton.create(buildButtonText(name), button -> {
          ZenClientMod.config().toggleFriendlyPlayerName(name);
          button.setMessage(buildButtonText(name));
        }, x, y, columnWidth, 20)
      );
    }

    addRenderableWidget(
      ZenGreenButton.create(Component.literal("Back"), button -> this.minecraft.setScreen(parent), (this.width / 2) - 68, this.height - 34, 136, 20)
    );
  }

  private List<String> collectCandidateNames() {
    List<String> names = new ArrayList<>();
    if (this.minecraft != null && this.minecraft.level != null && this.minecraft.player != null) {
      this.minecraft.level.players().stream()
        .map(Player::getName)
        .map(Component::getString)
        .filter((name) -> !name.equalsIgnoreCase(this.minecraft.player.getName().getString()))
        .sorted(String.CASE_INSENSITIVE_ORDER)
        .forEach(names::add);
    }
    for (String stored : ZenClientMod.config().orderedFriendlyPlayers()) {
      boolean present = names.stream().anyMatch((name) -> name.equalsIgnoreCase(stored));
      if (!present) names.add(stored);
    }
    names.sort(Comparator.comparing(String::toLowerCase));
    return names;
  }

  private Component buildButtonText(String name) {
    boolean enabled = ZenClientMod.config().isFriendlyPlayerAllowed(name);
    return Component.literal(name + "  [" + (enabled ? "ALLY" : "OFF") + "]");
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    ZenTheme.renderGreenFireBackground(context, this.width, this.height, delta);
    int panelLeft = (this.width / 2) - 250;
    int panelRight = (this.width / 2) + 250;
    int panelTop = 18;
    int panelBottom = this.height - 48;
    ZenTheme.renderPanel(context, panelLeft, panelTop, panelRight, panelBottom);
    super.render(context, mouseX, mouseY, delta);
    ZenTheme.drawCenteredOutlinedString(context, this.font, this.title, this.width / 2, 28, ZenTheme.WHITE, 0xFF063711);
    ZenTheme.drawCenteredOutlinedString(context, this.font, Component.literal("Pick which players count as allies for the co-op overlay"), this.width / 2, 46, ZenTheme.TEXT_SOFT, 0xFF063711);
  }

  @Override
  public void onClose() {
    this.minecraft.setScreen(parent);
  }
}
