import FreeCAD as App
import Part

# Nick's Corner Jig

# This is a FreeCAD script for creating a jig for holding corner joints during assembly.
# The wood dimensions and screw placements are configurable.

# Notes:
# - All dimensions are in millimeters.

# --- CONFIGURABLE PARAMETERS ---
wood_w = 36.0  # ~1.5 inches ... 38.1 technically but the wood still is smaller
wood_h = 36.0  # ~1.5 inches
tolerance = 0.4 # Extra space for fitting
jig_wall_h = 16.0 # Height of the jig walls
jig_wall_w = 4.0 # Width of the jig walls
jig_base_h = 4.0 # Height of the jig base
jig_l = 80.0 # Length of the jig
hole_d = 4.0 # Diameter for a screw drill hole

slot_w = wood_w + tolerance # Width of the slot for the wood

def make_two_part_jig():
    doc = App.newDocument("CornerJig")

    # Calculate total single side length including walls
    total_side_l = jig_wall_w + slot_w + jig_wall_w
    
    # Base
    base_v = Part.makeBox(jig_l, total_side_l, jig_base_h) # Vertical base plate
    base_v.translate(App.Vector(0, 0, 0))
    base_h = Part.makeBox(total_side_l, jig_l, jig_base_h) # Horizontal base plate
    base_h.translate(App.Vector(0, 0, 0))
    base = base_v.fuse(base_h)

    # Outer walls
    wall_1 = Part.makeBox(jig_l, jig_wall_w, jig_wall_h)
    wall_1.translate(App.Vector(0, 0, jig_base_h))
    wall_2 = Part.makeBox(jig_wall_w, jig_l, jig_wall_h)
    wall_2.translate(App.Vector(0, 0, jig_base_h))

    # Create Drill Holes
    # Hole for wall_1 (needs to lay on Y axis)
    hole_1 = Part.makeCylinder(hole_d/2, jig_wall_w)
    hole_1.rotate(App.Vector(0,0,0), App.Vector(1,0,0), 90)
    hole_1.translate(App.Vector(total_side_l/2, jig_wall_w, jig_base_h + (jig_wall_h/2)))
    
    # Hole for wall_2 (needs to lay on X axis)
    hole_2 = Part.makeCylinder(hole_d/2, jig_wall_w)
    hole_2.rotate(App.Vector(0,0,0), App.Vector(0,1,0), -90)
    hole_2.translate(App.Vector(jig_wall_w, (total_side_l/2), jig_base_h + (jig_wall_h/2)))

    # Perform hole cuts
    wall_1 = wall_1.cut(hole_1)
    wall_2 = wall_2.cut(hole_2)

    # Inner walls
    inner_wall_1 = Part.makeBox(jig_l + jig_wall_w - total_side_l, jig_wall_w, jig_wall_h)
    inner_wall_1.translate(App.Vector(total_side_l - jig_wall_w, total_side_l - jig_wall_w, jig_base_h))
    inner_wall_2 = Part.makeBox(jig_wall_w, jig_l + jig_wall_w - total_side_l, jig_wall_h)
    inner_wall_2.translate(App.Vector(total_side_l - jig_wall_w, total_side_l - jig_wall_w, jig_base_h))

    jig_base = base.fuse(wall_1).fuse(wall_2).fuse(inner_wall_1).fuse(inner_wall_2)
    
    # Add to document
    base_obj = doc.addObject("Part::Feature", "CornerJig")
    base_obj.Shape = jig_base
    
    App.ActiveDocument.recompute()

if __name__ == "__main__":
    make_two_part_jig()