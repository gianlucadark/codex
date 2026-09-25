"""Run in Blender on scene_codex_v2.blend; original source is never overwritten."""
import bpy, numpy as np, math, sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent.parent
out=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else root/'.astro/codex-work'
out.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;s.frame_set(18)
# Trace the real alpha silhouette, preserving both holes and original aspect ratio.
logo=bpy.data.images.load(str(root/'src/assets/logo-gd-transparent.png'))
logo.scale(384,384)
a=np.array(logo.pixels[:],dtype=np.float32).reshape(384,384,4)
mask=a[:,:,3]>.5
ys,xs=np.where(mask); xmin,xmax=xs.min(),xs.max();ymin,ymax=ys.min(),ys.max()
for o in list(s.objects):
 if o.name.startswith(('Compass medallion','Faded geometrical tooling')):bpy.data.objects.remove(o,do_unlink=True)
edges={}
for y,x in zip(ys,xs):
 for dx,dy,p,q in [(0,-1,(x,y),(x+1,y)),(1,0,(x+1,y),(x+1,y+1)),(0,1,(x+1,y+1),(x,y+1)),(-1,0,(x,y+1),(x,y))]:
  nx,ny=x+dx,y+dy
  if nx<0 or nx>=384 or ny<0 or ny>=384 or not mask[ny,nx]:edges.setdefault(p,[]).append(q)
loops=[]
while edges:
 start=next(iter(edges));p=start;loop=[]
 while True:
  loop.append(p);n=edges[p].pop()
  if not edges[p]:del edges[p]
  p=n
  if p==start:break
  if p not in edges:break
 if len(loop)>8:loops.append(loop)
curve=bpy.data.curves.new('GD original silhouette • hot stamp','CURVE');curve.dimensions='2D';curve.resolution_u=1;curve.fill_mode='BOTH';curve.extrude=.0018;curve.bevel_depth=.0012;curve.bevel_resolution=2
scale=1.16/max(xmax-xmin,ymax-ymin)
for loop in loops:
 # Suppress pixel stairs with a tiny contour-only smoothing, no anisotropic resize.
 pts=np.array(loop,dtype=float)
 for i in range(3):pts=(np.roll(pts,1,axis=0)+2*pts+np.roll(pts,-1,axis=0))/4
 spline=curve.splines.new('POLY');spline.points.add(len(pts)-1)
 for p,xy in zip(spline.points,pts):p.co=((xy[0]-(xmin+xmax)/2)*scale,(xy[1]-(ymin+ymax)/2)*scale,0,1)
 spline.use_cyclic_u=True
obj=bpy.data.objects.new('GD • bevelled hot-foil impression',curve);s.collection.objects.link(obj)
obj.parent=bpy.data.objects['OPEN_CODEX'];obj.location=(1.58,-.48,.096)
mat=bpy.data.materials.new('GD • satin antique brass');mat.use_nodes=True;mat['codex_v2_pbr']=True
p=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(.32,.185,.065,1);p.inputs['Metallic'].default_value=.78;p.inputs['Roughness'].default_value=.39
curve.materials.append(mat)
# Restrained calfskin: keep patina, lower the contrast of the worn orange patches.
im=bpy.data.images['antique_leather.png'];px=np.array(im.pixels[:],dtype=np.float32).reshape(-1,4);px[:,:3]=px[:,:3]*.63+np.array([.034,.017,.012]);im.pixels.foreach_set(px.ravel());im.pack()
wood=bpy.data.images['walnut_basecolor_v2.png'];wp=np.array(wood.pixels[:],dtype=np.float32).reshape(-1,4);wp[:,:3]=wp[:,:3]*.72+np.array([.025,.018,.012]);wood.pixels.foreach_set(wp.ravel());wood.pack()
for name in ['calfskin_normal_v2.png','calfskin_orm_v2.png']:
 bpy.data.images[name].pack()
# Keep fine grain, with less exaggerated normal relief on the walnut.
for m in bpy.data.materials:
 if m.use_nodes and m.name.startswith('Smoked walnut'):
  for n in m.node_tree.nodes:
   if n.type=='NORMAL_MAP':n.inputs['Strength'].default_value=.45
for o in s.objects:
 if o.type=='LIGHT' and o.data.type=='AREA':
  o.data.color=(1,.92,.81);o.data.size=max(o.data.size,4)
# Save editable master before the web exporter consolidates geometry.
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Codex_Studio_v3.blend'))
__file__=str(root/'scripts/export-codex-v3.py');exec(compile(Path(__file__).read_text(encoding='utf8'),__file__,'exec'))

