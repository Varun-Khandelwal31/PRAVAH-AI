"""Synthetic crowd simulator rendering 1280x720 frames of moving crowd blobs.

Generates realistic density, optical flow, jam stagnation, and surge convergence signals
without requiring any external video files or GPUs.
"""
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np
from app.config import Zone, settings


class SimAgent:
    """Represents an individual person agent in the synthetic venue."""

    def __init__(self, x: float, y: float, zone_id: Optional[str] = None):
        self.x = float(x)
        self.y = float(y)
        self.vx = 0.0
        self.vy = 0.0
        self.target_x = float(x)
        self.target_y = float(y)
        self.target_zone: Optional[str] = zone_id
        self.speed = float(np.random.uniform(0.003, 0.008))
        self.radius = int(np.random.randint(9, 13))
        # Warm clothing colors (typical Indian crowd garments: saffron, navy, maroon, teal, cream)
        palette = [
            (30, 110, 220),   # saffron/orange
            (140, 50, 40),    # navy/deep blue
            (40, 40, 180),    # maroon/red
            (130, 130, 40),   # teal
            (180, 200, 210),  # cream/white
            (50, 120, 60),    # green
        ]
        self.color = palette[np.random.randint(0, len(palette))]


class CrowdSimulator:
    """Simulates 30-80 crowd agents moving across defined venue zones."""

    def __init__(
        self,
        zones: Optional[List[Zone]] = None,
        num_agents: int = 75,
        scenario: str = "nominal",
        width: int = 1280,
        height: int = 720,
    ):
        self.zones = zones if zones is not None else settings.zones
        self.zone_map = {z.id: z for z in self.zones}
        self.num_agents = num_agents
        self.scenario = scenario
        self.width = width
        self.height = height
        self.elapsed_sec = 0.0
        self.jam_locked = False
        self.speed_mult = 1.0
        self.target_densities: Dict[str, float] = {}

        # Zone centers
        self.zone_centers: Dict[str, Tuple[float, float]] = {}
        for z in self.zones:
            pts = np.array(z.points)
            cx = float(np.mean(pts[:, 0]))
            cy = float(np.mean(pts[:, 1]))
            self.zone_centers[z.id] = (cx, cy)

        # Initialize agents distributed across entry and circulation zones
        self.agents: List[SimAgent] = []
        zone_ids = list(self.zone_map.keys())
        for _ in range(self.num_agents):
            zid = zone_ids[np.random.randint(0, len(zone_ids))]
            cx, cy = self.zone_centers.get(zid, (0.5, 0.5))
            # Jitter slightly around zone center
            x = np.clip(cx + np.random.uniform(-0.08, 0.08), 0.06, 0.94)
            y = np.clip(cy + np.random.uniform(-0.06, 0.06), 0.06, 0.94)
            agent = SimAgent(x, y, zid)
            self._pick_new_waypoint(agent)
            self.agents.append(agent)

    def _pick_new_waypoint(self, agent: SimAgent):
        """Picks a plausible next waypoint for an agent based on normal venue circulation."""
        if self.scenario == "escalation" or agent.target_zone == "barricade_corridor":
            # Barricade Corridor attractor center: (0.50, 0.365)
            bc_cx, bc_cy = self.zone_centers.get("barricade_corridor", (0.50, 0.365))
            agent.target_x = np.clip(bc_cx + np.random.uniform(-0.11, 0.11), 0.37, 0.63)
            agent.target_y = np.clip(bc_cy + np.random.uniform(-0.06, 0.06), 0.30, 0.43)
            return

        # Circulate through typical path: entry -> ticket_queue / corridor -> concourse -> exits
        curr_z = agent.target_zone
        flow_graph = {
            "north_entry": ["ticket_queue", "side_passage", "barricade_corridor"],
            "ticket_queue": ["barricade_corridor", "east_wing"],
            "barricade_corridor": ["main_concourse"],
            "side_passage": ["gate_2_overflow", "main_concourse"],
            "east_wing": ["main_concourse", "exit_lane"],
            "main_concourse": ["gate_2_overflow", "exit_lane"],
            "gate_2_overflow": ["exit_lane", "north_entry"],
            "exit_lane": ["north_entry", "ticket_queue"],
        }
        candidates = flow_graph.get(curr_z, list(self.zone_map.keys()))
        next_zid = candidates[np.random.randint(0, len(candidates))]
        agent.target_zone = next_zid
        cx, cy = self.zone_centers.get(next_zid, (0.5, 0.5))
        agent.target_x = np.clip(cx + np.random.uniform(-0.07, 0.07), 0.06, 0.94)
        agent.target_y = np.clip(cy + np.random.uniform(-0.05, 0.05), 0.06, 0.94)

    def set_scenario(self, scenario: str):
        """Switches simulation scenario ('nominal', 'escalation')."""
        self.scenario = scenario
        self.elapsed_sec = 0.0
        self.jam_locked = False
        if scenario == "nominal":
            self.target_densities.clear()
            for agent in self.agents:
                agent.target_zone = None
                self._pick_new_waypoint(agent)

    def inject_target_density(self, zone_id: str, target_density: float):
        """Forces a specific target density (people/m^2) into a zone by steering agents."""
        self.target_densities[zone_id] = float(target_density)

    def clear_target_density(self, zone_id: Optional[str] = None):
        """Clears target density override."""
        if zone_id:
            self.target_densities.pop(zone_id, None)
        else:
            self.target_densities.clear()

    def update(self, dt: float = 0.2):
        """Advances agent movement for one tick dt."""
        self.elapsed_sec += dt

        # Check if escalation scenario has reached jam-lock threshold (> 60s or high density)
        if self.scenario == "escalation":
            # Over 90s, pull up to 72 agents into Barricade Corridor (area 18m^2 -> 4.0 p/m^2)
            progress = min(self.elapsed_sec / 90.0, 1.0)
            target_agents = int(12 + progress * 62)  # from 12 to 74
            self.inject_target_density("barricade_corridor", target_agents / 18.0)
            if self.elapsed_sec >= 60.0:
                self.jam_locked = True

        # Process target density requirements
        for zid, target_dens in self.target_densities.items():
            zone = self.zone_map.get(zid)
            if not zone:
                continue
            desired_count = int(round(target_dens * zone.area_m2))
            desired_count = min(desired_count, self.num_agents)

            # Count how many agents currently target this zone
            current_targets = [a for a in self.agents if a.target_zone == zid]
            if len(current_targets) < desired_count:
                needed = desired_count - len(current_targets)
                for agent in self.agents:
                    if needed <= 0:
                        break
                    if agent.target_zone != zid:
                        agent.target_zone = zid
                        cx, cy = self.zone_centers.get(zid, (0.5, 0.5))
                        agent.target_x = np.clip(cx + np.random.uniform(-0.08, 0.08), 0.36, 0.64)
                        agent.target_y = np.clip(cy + np.random.uniform(-0.05, 0.05), 0.29, 0.44)
                        needed -= 1

        # Move agents
        for agent in self.agents:
            dx = agent.target_x - agent.x
            dy = agent.target_y - agent.y
            dist = np.sqrt(dx * dx + dy * dy)

            # If jammed in Barricade Corridor, near-zero movement
            is_in_bc = (0.35 <= agent.x <= 0.65) and (0.28 <= agent.y <= 0.45)
            if self.jam_locked and is_in_bc:
                # Near-zero jitter (< 0.2 px/frame in 1280x720 = < 0.0002 normalized)
                agent.vx = float(np.random.uniform(-0.0001, 0.0001))
                agent.vy = float(np.random.uniform(-0.0001, 0.0001))
                agent.x = np.clip(agent.x + agent.vx, 0.36, 0.64)
                agent.y = np.clip(agent.y + agent.vy, 0.29, 0.44)
                continue

            if dist < 0.02:
                # Reached waypoint
                if self.scenario != "escalation" and not agent.target_zone:
                    self._pick_new_waypoint(agent)
                else:
                    # Small ambient wander around target
                    agent.target_x = np.clip(agent.target_x + np.random.uniform(-0.03, 0.03), 0.06, 0.94)
                    agent.target_y = np.clip(agent.target_y + np.random.uniform(-0.03, 0.03), 0.06, 0.94)

            # Move towards destination with smooth velocity
            if dist > 0.0001:
                step = min(agent.speed * (dt / 0.2) * self.speed_mult, dist)
                agent.vx = (dx / dist) * step
                agent.vy = (dy / dist) * step
                agent.x = np.clip(agent.x + agent.vx, 0.04, 0.96)
                agent.y = np.clip(agent.y + agent.vy, 0.04, 0.96)

    def render_frame(self) -> np.ndarray:
        """Renders the current simulation state as a 1280x720 synthetic CCTV frame."""
        frame = np.full((self.height, self.width, 3), 24, dtype=np.uint8)

        # Draw subtle floor grid and zone outlines
        for zone in self.zones:
            pts = np.array(
                [[int(pt[0] * self.width), int(pt[1] * self.height)] for pt in zone.points],
                dtype=np.int32,
            )
            cv2.polylines(frame, [pts], True, (45, 50, 60), 1)

        # Draw agents as distinct person-like blobs (head & torso circle with outer shadow)
        for agent in self.agents:
            px = int(agent.x * self.width)
            py = int(agent.y * self.height)

            # Torso blob
            cv2.circle(frame, (px, py), agent.radius, agent.color, -1)
            # Head highlight
            head_r = max(4, int(agent.radius * 0.55))
            cv2.circle(frame, (px, py - 2), head_r, (230, 230, 230), -1)
            # Subtle edge outline
            cv2.circle(frame, (px, py), agent.radius, (10, 10, 10), 1)

        return frame

    def get_agent_centroids(self) -> List[Tuple[float, float, float]]:
        """Returns normalized (cx, cy, conf) centroid tuples for all simulated agents."""
        return [(round(a.x, 4), round(a.y, 4), 0.95) for a in self.agents]
