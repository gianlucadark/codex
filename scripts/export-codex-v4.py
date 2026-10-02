"""Export Codex_Studio_v4.blend to public/codex/scene_codex_v4.glb (run by upgrade-codex-v4.py).

& 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe' -b Codex_Studio_v4.blend --python scripts/export-codex-v4.py

Same consolidation as v3 (planar UVs where missing, eight folio tones, one mesh per
parent+material), but objects built by the v4 upgrade (`codex_v4`) keep their exact
geometry: they are already budgeted and must not be decimated.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Matrix

root = Path(__file__).resolve().parent.parent
out = root / 'public' / 'codex'
s = bpy.context.scene
s.render.engine = 'BLENDER_EEVEE'
conversion = Matrix.Rotation(-math.pi / 2, 4, 'X')
hinge = bpy.data.objects['OPEN_CODEX']
samples = []
for frame in range(18, 191):
    s.frame_set(frame)
    cm = conversion @ s.camera.matrix_world
    hm = conversion @ hinge.matrix_local @ conversion.inverted()
    cq, hq = cm.to_quaternion(), hm.to_quaternion()
    samples.append({'p': [round(v, 6) for v in cm.translation], 'q': [round(v, 7) for v in [cq.x, cq.y, cq.z, cq.w]], 'h': [round(v, 7) for v in [hq.x, hq.y, hq.z, hq.w]]})
with open(out / 'motion.json', 'w') as f:
    json.dump({'fps': 30, 'start': 18, 'end': 190, 'fov': math.degrees(2 * math.atan(27 / (2 * 43))), 'samples': samples}, f, separators=(',', ':'))
s.frame_set(18)


def select(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


for o in list(s.objects):
    if o.type in {'FONT', 'CURVE'}:
        keep = o.get('codex_v4')
        select(o)
        bpy.ops.object.convert(target='MESH')
        if keep: o['codex_v4'] = True
for o in list(s.objects):
    if o.type != 'MESH': continue
    textured = any(m and m.name.startswith(('Oxblood', 'Warm rag', 'Smoked walnut', 'Leather turned')) for m in o.data.materials)
    if textured and not o.get('codex_v2_uv'):
        uv = o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
        xs = [v.co.x for v in o.data.vertices]; ys = [v.co.y for v in o.data.vertices]
        xmin, xmax = min(xs), max(xs); ymin, ymax = min(ys), max(ys)
        for loop in o.data.loops:
            co = o.data.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = ((co.x - xmin) / max(xmax - xmin, .0001), (co.y - ymin) / max(ymax - ymin, .0001))
    if len(o.data.vertices) > 3000 and not o.get('codex_v4') and not o.name.startswith(('Inside cover', 'GD')):
        select(o)
        mod = o.modifiers.new('Web geometry reduction', 'DECIMATE')
        mod.ratio = .065 if o.name.startswith('About') else .13
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if o.name.startswith('About'):
        for v in o.data.vertices: v.co.z -= .009
    select(o)
    for mod in list(o.modifiers):
        try: bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception: o.modifiers.remove(mod)

# Remaining procedural graphs become their portable Principled equivalents.
for m in list(bpy.data.materials):
    if not m.use_nodes or m.get('codex_v2_pbr'): continue
    n = m.node_tree.nodes; l = m.node_tree.links
    p = next((x for x in n if x.type == 'BSDF_PRINCIPLED'), None)
    image = next((x.image for x in n if x.type == 'TEX_IMAGE' and x.image), None)
    if not p:
        p = n.new('ShaderNodeBsdfPrincipled'); p.inputs['Roughness'].default_value = .9
    output = next((x for x in n if x.type == 'OUTPUT_MATERIAL'), None) or n.new('ShaderNodeOutputMaterial')
    for link in list(l):
        if link.to_node == p and link.to_socket.name in {'Base Color', 'Normal'}: l.remove(link)
    if image:
        tx = n.new('ShaderNodeTexImage'); tx.image = image
        l.new(tx.outputs['Color'], p.inputs['Base Color'])
    l.new(p.outputs['BSDF'], output.inputs['Surface'])
    if m.name == 'Candle flame':
        p.inputs['Emission Color'].default_value = (1, .33, .045, 1)
        p.inputs['Emission Strength'].default_value = 4

folio_mats = sorted([m for m in bpy.data.materials if m.name.startswith('Folio tone')], key=lambda m: m.name)
palette = folio_mats[:8]
reds = [next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value[0] for m in folio_mats]
rmin, rmax = min(reds), max(reds)
for o in s.objects:
    if o.type != 'MESH': continue
    for slot in o.material_slots:
        if slot.material and slot.material.name.startswith('Folio tone'):
            p = next(n for n in slot.material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            index = min(7, max(0, round((p.inputs['Base Color'].default_value[0] - rmin) / max(rmax - rmin, 1e-4) * 7)))
            slot.material = palette[index]

groups = {}
for o in list(s.objects):
    if o.type != 'MESH' or o.name.startswith(('PORTFOLIO_PREVIEW', 'Small flame', 'CONTACT_AO')): continue
    if len(o.data.materials) != 1: continue
    key = (o.parent.name if o.parent else '', o.data.materials[0].name)
    groups.setdefault(key, []).append(o)
for key, objects in groups.items():
    if len(objects) < 2: continue
    keep = any(o.get('codex_v4') for o in objects)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = 'Web ' + key[1] + (' cover' if key[0] else '')
    if keep: objects[0]['codex_v4'] = True

for o in list(s.objects):
    if o.type != 'MESH' or len(o.data.polygons) < 5000 or o.get('codex_v4'): continue
    select(o)
    mod = o.modifiers.new('Web final silhouette budget', 'DECIMATE')
    mod.ratio = .20 if o.name.startswith(('GD', 'Web Timeworn', 'Web Iron')) else .38
    bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.select_all(action='DESELECT')
for o in s.objects:
    if (o.type == 'MESH' and o.visible_get()) or o == hinge: o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(out / 'scene_codex_v4.glb'), export_format='GLB', use_selection=True,
    export_animations=False, export_cameras=False, export_lights=False,
    export_yup=True, export_apply=True,
    export_image_format='WEBP', export_image_quality=86,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_extras=False, export_materials='EXPORT',
)
print('CODEX_V4_EXPORTED', sum(len(o.data.polygons) for o in s.objects if o.type == 'MESH'), flush=True)
