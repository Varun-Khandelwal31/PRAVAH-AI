"""Scripted demo escalation controller with realistic target density injection.

Progression:
  t+0s:   All green (nominal circulation)
  t+20s:  Amber on Barricade Corridor (~2.6 p/m^2)
  t+50s:  Red on Barricade Corridor + ETA < 5 min (~3.8 p/m^2, rising slope)
  t+60s:  Alert fired + flow jam-locked (critical >= 4.0 p/m^2)
  t+120s: Auto-resolve (agents disperse, returning to nominal green)
"""
import asyncio
import logging
import time
from typing import Optional
from app.sim.replay_engine import ReplayEngine, SimulatorSource

logger = logging.getLogger(__name__)


class DemoController:
    """Controls scripted demo escalation via physical simulator target-density injection."""

    def __init__(self, engine: ReplayEngine):
        self.engine = engine
        self.task: Optional[asyncio.Task] = None
        self.running = False
        self.start_time: Optional[float] = None
        self.speed_mult: float = 1.0

    def _get_simulator(self):
        """Helper to get underlying CrowdSimulator if current source is a SimulatorSource."""
        if isinstance(self.engine.source, SimulatorSource):
            return self.engine.source.simulator
        return None

    async def _timeline_loop(self):
        """Asynchronous execution of the 120-second escalation timeline."""
        sim = self._get_simulator()
        if not sim:
            logger.warning("DemoController cannot inject target densities into non-simulator source")
            return

        logger.info("Demo escalation started at t=0s (speed_mult=%.1f)", self.speed_mult)
        self.start_time = time.time()

        try:
            while self.running:
                elapsed = (time.time() - self.start_time) * self.speed_mult

                if elapsed < 20.0:
                    # t+0 to t+20: Rising from 0.8 to 2.4 p/m^2
                    frac = elapsed / 20.0
                    target_density = 0.8 + frac * 1.6
                    sim.inject_target_density("barricade_corridor", target_density)
                    sim.jam_locked = False

                elif elapsed < 50.0:
                    # t+20 to t+50: Amber range rising to Red threshold (~2.6 to ~3.8 p/m^2)
                    frac = (elapsed - 20.0) / 30.0
                    target_density = 2.4 + frac * 1.4
                    sim.inject_target_density("barricade_corridor", target_density)
                    sim.jam_locked = False

                elif elapsed < 60.0:
                    # t+50 to t+60: Red range rising to critical threshold (~3.8 to ~4.2 p/m^2)
                    frac = (elapsed - 50.0) / 10.0
                    target_density = 3.8 + frac * 0.4
                    sim.inject_target_density("barricade_corridor", target_density)
                    # Begin flow congestion
                    if elapsed > 55.0:
                        sim.jam_locked = True

                elif elapsed < 120.0:
                    # t+60 to t+120: Critical alert state with full jam-lock
                    sim.inject_target_density("barricade_corridor", 4.25)
                    sim.jam_locked = True

                else:
                    # t+120: Auto-resolve
                    logger.info("Demo escalation auto-resolving at t=120s")
                    await self.clear()
                    break

                await asyncio.sleep(0.5)

        except asyncio.CancelledError:
            logger.info("Demo escalation timeline cancelled")
        finally:
            self.running = False

    async def escalate(self, speed_mult: float = 1.0):
        """Triggers the escalation demo sequence."""
        if self.running and self.task:
            self.task.cancel()

        self.speed_mult = max(0.1, float(speed_mult))
        sim = self._get_simulator()
        if sim:
            sim.speed_mult = self.speed_mult
            sim.set_scenario("nominal")
            sim.jam_locked = False
            # Initial density target
            sim.inject_target_density("barricade_corridor", 0.8)

        self.running = True
        self.task = asyncio.create_task(self._timeline_loop())
        logger.info("Escalation demo triggered via REST")

    async def clear(self):
        """Resets the demo and restores nominal crowd flow."""
        if self.task and not self.task.done():
            self.task.cancel()

        self.running = False
        sim = self._get_simulator()
        if sim:
            sim.speed_mult = 1.0
            sim.set_scenario("nominal")
            sim.clear_target_density()
            sim.jam_locked = False

        # Clear any active engine alerts
        self.engine.active_alerts.clear()
        self.engine.log_incident_event(
            event_type="cleared",
            zone_id="barricade_corridor",
            zone_name="Barricade Corridor",
            payload={"action": "Manual demo reset"},
        )
        logger.info("Demo state cleared via REST")
