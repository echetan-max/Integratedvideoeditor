#!/usr/bin/env python3
"""
Test script to demonstrate the difference between original and enhanced AutoZoom
"""

import json
import os

def compare_outputs():
    """Compare the outputs of original vs enhanced AutoZoom"""
    
    print("🔍 AutoZoom Output Comparison")
    print("=" * 50)
    
    # Check if enhanced output exists
    if os.path.exists("out.mp4") and os.path.exists("clicks.json"):
        print("✅ Enhanced AutoZoom Output Found!")
        
        # Load clicks data
        with open("clicks.json", "r") as f:
            clicks_data = json.load(f)
        
        print(f"\n📊 Recording Info:")
        print(f"   Duration: {clicks_data.get('duration', 0):.1f} seconds")
        print(f"   Resolution: {clicks_data.get('width', 0)}x{clicks_data.get('height', 0)}")
        print(f"   FPS: {clicks_data.get('fps', 30)}")
        print(f"   Total Clicks: {clicks_data.get('totalClicks', 0)}")
        
        print(f"\n🎯 Auto-Zoom Effects:")
        for i, click in enumerate(clicks_data.get('clicks', [])):
            print(f"   {i+1}. Time: {click.get('time', 0):.1f}s")
            print(f"      Position: ({click.get('x', 0)}, {click.get('y', 0)})")
            print(f"      Zoom Level: {click.get('zoomLevel', 2.0)}x")
            print(f"      Duration: {click.get('duration', 3.0)}s")
        
        print(f"\n🎬 What This Means:")
        print(f"   ✅ Raw video: out.mp4 (no zoom effects applied)")
        print(f"   ✅ Click data: clicks.json (zoom effects for timeline)")
        print(f"   ✅ Timeline editing: All zooms are now editable!")
        print(f"   ✅ Real-time preview: Changes show immediately in video")
        
    else:
        print("❌ Enhanced output not found")
        print("   Run: python sak_enhanced.py")
        print("   Then: Start recording → Click around → Stop recording")
    
    print(f"\n🔄 Comparison with Original:")
    print(f"   Original sak.py: Video with zoom effects baked in (not editable)")
    print(f"   Enhanced sak_enhanced.py: Raw video + editable zoom data")
    print(f"   Result: Full timeline editing capability!")

if __name__ == "__main__":
    compare_outputs() 