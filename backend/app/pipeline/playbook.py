"""Zone-specific tactical playbooks mapped to NDMA crowd-management practice.

Generic "open Gate 2" for every sector is not an SOP. Each zone gets a 3-step
checklist a marshal can execute without watching 32 CCTV tiles.
"""
from typing import Dict, List, TypedDict


class ZonePlaybook(TypedDict):
    sop: str
    actions: List[str]
    radio: str


_DEFAULT: ZonePlaybook = {
    "sop": "NDMA Crowd Management 2014 · hold inbound, open relief, staff the pinch",
    "actions": [
        "Hold inbound at the previous holding pen",
        "Open the designated overflow / relief gate",
        "Dispatch 2 marshals to the pinch point",
    ],
    "radio": "Hold inbound. Open overflow. Two marshals to pinch.",
}

PLAYBOOKS: Dict[str, ZonePlaybook] = {
    "north_entry": {
        "sop": "NDMA 2014 · entry metering",
        "actions": [
            "Throttle inbound at North holding pen (batch 40)",
            "Open secondary screening lane",
            "Dispatch 2 marshals to ticket-queue mouth",
        ],
        "radio": "Meter North Entry. Open second lane. Two marshals to queue mouth.",
    },
    "ticket_queue": {
        "sop": "NDMA 2014 · queue serpentine relief",
        "actions": [
            "Freeze ticket issuance for 90 seconds",
            "Open bypass lane into Side Passage",
            "Dispatch 2 marshals to unjam the serpentine",
        ],
        "radio": "Pause tickets. Open bypass. Two marshals into serpentine.",
    },
    "barricade_corridor": {
        "sop": "NDMA 2014 · bottleneck relief (highest crush risk)",
        "actions": [
            "Open Gate 2 overflow to relieve inbound pressure",
            "Divert queue one-way into Side Passage",
            "Dispatch 2 marshals; freeze inbound at Ticket Queue",
        ],
        "radio": "Open Gate 2. Divert Side Passage. Freeze inbound at tickets.",
    },
    "side_passage": {
        "sop": "NDMA 2014 · relief corridor keep-clear",
        "actions": [
            "Keep Side Passage one-way outbound only",
            "Block reverse flow from Main Concourse",
            "Dispatch 1 marshal + 1 volunteer at each mouth",
        ],
        "radio": "Side Passage outbound only. Block reverse. Staff both mouths.",
    },
    "main_concourse": {
        "sop": "NDMA 2014 · plaza load-shed",
        "actions": [
            "Open East Wing as a secondary dwell area",
            "Accelerate Exit Lane throughput (drop bag checks)",
            "Dispatch 2 marshals to split the plaza into two streams",
        ],
        "radio": "Open East Wing dwell. Speed Exit Lane. Split plaza streams.",
    },
    "east_wing": {
        "sop": "NDMA 2014 · wing overflow",
        "actions": [
            "Route new arrivals away from East Wing",
            "Open Gate 2 if wing is a dead-end",
            "Dispatch 2 marshals to walk people toward Exit Lane",
        ],
        "radio": "Stop inbound to East Wing. Open Gate 2. Walk people to exit.",
    },
    "gate_2_overflow": {
        "sop": "NDMA 2014 · overflow gate operations",
        "actions": [
            "Confirm Gate 2 is fully unlatched and staffed",
            "Form two outbound files; no inbound",
            "Dispatch 2 marshals to prevent re-entry eddy",
        ],
        "radio": "Staff Gate 2 fully open. Two outbound files. No re-entry.",
    },
    "exit_lane": {
        "sop": "NDMA 2014 · egress acceleration",
        "actions": [
            "Drop secondary screening on Exit Lane",
            "Push dwellers from Main Concourse into exit",
            "Dispatch 2 marshals to break counter-flow",
        ],
        "radio": "Drop exit checks. Push concourse out. Break counter-flow.",
    },
    "live_hall": {
        "sop": "NDMA 2014 · indoor hall metering",
        "actions": [
            "Stop further entry at the hall door",
            "Open the nearest side door as relief",
            "Dispatch 2 marshals to walk people out in a single file",
        ],
        "radio": "Close hall entry. Open side door. Single-file egress.",
    },
}


def playbook_for(zone_id: str) -> ZonePlaybook:
    return PLAYBOOKS.get(zone_id, _DEFAULT)
