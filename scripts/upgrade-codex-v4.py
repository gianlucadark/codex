"""Codex v4: a physical fifteenth-century binding on a fuller scriptorium desk.

& 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe' -b Codex_Studio_v3.blend --python scripts/upgrade-codex-v4.py -- OUT_DIR

Builds on the v3 master without touching it: cushioned boards with blind-tooled
relief, brass corner pieces, bosses and clasps, a rounded text block with a gutter
roll, a draped silk marker, headbands, and desk props (quill, hourglass, sealed
scroll, rivet spectacles, ink stains, wax). Bakes the table contact occlusion,
saves OUT_DIR/Codex_Studio_v4.blend and runs scripts/export-codex-v4.py.
Every name the runtime looks up (OPEN_CODEX, PORTFOLIO_SCREEN, Small flame,
Candle flame, Beeswax, Aged brass, Folio tone, folio_studi) is preserved.
"""
import bpy, bmesh, math, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else root / '.astro/codex-work'
out.mkdir(parents=True, exist_ok=True)
s = bpy.context.scene
s.frame_set(18)
rng = np.random.default_rng(1404)
TABLE = .0655
HINGE = bpy.data.objects['OPEN_CODEX']


# ── Raster helpers ──────────────────────────────────────────────────────────

def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def resample(a, h, w):
    """Bilinear resize of a 2D/3D array (rows bottom-up, like Blender images)."""
    y = np.linspace(0, a.shape[0] - 1, h); x = np.linspace(0, a.shape[1] - 1, w)
    y0 = np.floor(y).astype(int); x0 = np.floor(x).astype(int)
    y1 = np.minimum(y0 + 1, a.shape[0] - 1); x1 = np.minimum(x0 + 1, a.shape[1] - 1)
    fy = (y - y0)[:, None]; fx = (x - x0)[None, :]
    if a.ndim == 3: fy = fy[..., None]; fx = fx[..., None]
    top = a[y0][:, x0] * (1 - fx) + a[y0][:, x1] * fx
    bottom = a[y1][:, x0] * (1 - fx) + a[y1][:, x1] * fx
    return top * (1 - fy) + bottom * fy


def noise(h, w, cells, octaves=4, seed=0):
    """Smooth value noise in [0, 1] with `cells` features across the width."""
    g = np.random.default_rng(seed)
    total = np.zeros((h, w)); amp = 1; norm = 0
    for o in range(octaves):
        cw = max(2, int(cells * 2 ** o)); ch = max(2, int(cw * h / w))
        layer = resample(g.random((ch + 1, cw + 1)), h, w)
        total += layer * amp; norm += amp; amp *= .5
    return total / norm


def blur(a, r):
    """Approximate Gaussian blur with three box passes (radius in pixels)."""
    r = int(max(1, r))
    for _ in range(3):
        for axis in (0, 1):
            pad = [(0, 0)] * a.ndim; pad[axis] = (r + 1, r)
            c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
            a = (np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis) - np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)) / (2 * r + 1)
    return a


def normal_map(height, texel):
    """Tangent-space normal map from a height field expressed in world units."""
    dy, dx = np.gradient(height, texel)
    n = np.dstack([-dx, -dy, np.ones_like(height)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * .5 + .5


def image(name, rgb, alpha=None, data=False):
    h, w = rgb.shape[:2]
    old = bpy.data.images.get(name)
    if old: old.name = name + '.stale'
    img = bpy.data.images.new(name, w, h, alpha=alpha is not None)
    # The colour space must be set before the pixels: changing it afterwards
    # regenerates the buffer and silently drops what was written.
    if data: img.colorspace_settings.name = 'Non-Color'
    px = np.ones((h, w, 4), dtype=np.float32)
    px[..., :3] = np.clip(rgb, 0, 1)
    if alpha is not None: px[..., 3] = np.clip(alpha, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.file_format = 'PNG'
    img.update(); img.pack()
    if old:
        old.user_remap(img); bpy.data.images.remove(old)
    return img


def pixels(img):
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)


# ── Material helpers ────────────────────────────────────────────────────────

def material(name, color=(.8, .8, .8), rough=.5, metal=0., alpha=1., base=None, normal=None, orm=None, normal_strength=1., coat=0., double=False, orm_metal=True):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; m['codex_v2_pbr'] = True
    nt = m.node_tree; nt.nodes.clear()
    out_node = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(p.outputs['BSDF'], out_node.inputs['Surface'])
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat
    if base:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = base
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
        if alpha < 1 or base.get('codex_alpha'): nt.links.new(t.outputs['Alpha'], p.inputs['Alpha'])
    if alpha < 1 and not (base and base.get('codex_alpha')): p.inputs['Alpha'].default_value = alpha
    if normal:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = normal
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if orm:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = orm
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(t.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], p.inputs['Roughness'])
        if orm_metal: nt.links.new(sep.outputs['Blue'], p.inputs['Metallic'])
    if alpha < 1 or (base and base.get('codex_alpha')): m.surface_render_method = 'BLENDED'
    m.use_backface_culling = not double
    return m


# ── Mesh helpers ────────────────────────────────────────────────────────────

def mesh(name, verts, faces, mat, uvs=None, parent=None, sharp=None, collection=None):
    """Object from raw data. `uvs` is per-face lists of (u, v), parallel to faces."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    if uvs is not None:
        layer = me.uv_layers.new(name='UVMap')
        for poly, face_uv in zip(me.polygons, uvs):
            for li, uv in zip(poly.loop_indices, face_uv): layer.data[li].uv = uv
    me.materials.append(mat)
    me.shade_smooth()
    if sharp is not None: me.set_sharp_from_angle(angle=math.radians(sharp))
    o = bpy.data.objects.new(name, me)
    (collection or s.collection).objects.link(o)
    if parent: o.parent = parent; o.matrix_parent_inverse = parent.matrix_world.inverted()
    o['codex_v4'] = True; o['codex_v2_uv'] = True
    return o


def lathe(name, profile, mat, loc=(0, 0, 0), segments=40, parent=None, sharp=None, wobble=0., seed=0):
    """Surface of revolution around +Z from (radius, z) pairs, bottom to top."""
    g = np.random.default_rng(seed)
    phase = g.random(3) * 6.283
    verts, faces, uvs = [], [], []
    lengths = [0.]
    for a, b in zip(profile, profile[1:]): lengths.append(lengths[-1] + math.dist(a, b))
    rows = []
    for (r, z), length in zip(profile, lengths):
        if r < 1e-5:
            rows.append([len(verts)]); verts.append((loc[0], loc[1], loc[2] + z)); continue
        row = []
        for k in range(segments):
            t = k / segments * 2 * math.pi
            rr = r * (1 + wobble * (math.sin(2 * t + phase[0]) * .6 + math.sin(3 * t + phase[1]) * .4))
            row.append(len(verts)); verts.append((loc[0] + rr * math.cos(t), loc[1] + rr * math.sin(t), loc[2] + z))
        rows.append(row)
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1]
        va, vb = lengths[i] / lengths[-1], lengths[i + 1] / lengths[-1]
        for k in range(segments):
            k1 = (k + 1) % segments
            u0, u1 = k / segments, (k + 1) / segments
            if len(a) == 1: faces.append((a[0], b[k], b[k1])); uvs.append([(u0, va), (u0, vb), (u1, vb)])
            elif len(b) == 1: faces.append((a[k], a[k1], b[0])); uvs.append([(u0, va), (u1, va), (u0, vb)])
            else: faces.append((a[k], a[k1], b[k1], b[k])); uvs.append([(u0, va), (u1, va), (u1, vb), (u0, vb)])
    return mesh(name, verts, faces, mat, uvs, parent, sharp)


def frames(points, up=(0, 0, 1)):
    """Tangent/side/normal frames along a polyline, with a stable up hint."""
    P = [Vector(p) for p in points]
    out_frames = []
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        u = Vector(up) if not callable(up) else Vector(up(i))
        side = t.cross(u)
        if side.length < 1e-6: side = t.cross(Vector((1, 0, 0)))
        side.normalize(); n = side.cross(t).normalized()
        out_frames.append((p, t, side, n))
    return out_frames


def sweep(name, points, section, mat, up=(0, 0, 1), scale=None, parent=None, cap=True, sharp=None, twist=None):
    """Sweep a closed 2D section (side, normal) along a path. UV: u around, v along."""
    fr = frames(points, up)
    verts, faces, uvs = [], [], []
    m = len(section)
    lengths = [0.]
    for a, b in zip(points, points[1:]): lengths.append(lengths[-1] + math.dist(a, b))
    for i, (p, t, side, n) in enumerate(fr):
        sc = scale(i / (len(fr) - 1)) if scale else 1.
        ang = twist(i / (len(fr) - 1)) if twist else 0.
        c, sn = math.cos(ang), math.sin(ang)
        for a, b in section:
            a2, b2 = a * c - b * sn, a * sn + b * c
            verts.append(tuple(p + side * a2 * sc + n * b2 * sc))
    perim = [0.]
    for k in range(m): perim.append(perim[-1] + math.dist(section[k], section[(k + 1) % m]))
    for i in range(len(fr) - 1):
        for k in range(m):
            k1 = (k + 1) % m
            faces.append((i * m + k, i * m + k1, (i + 1) * m + k1, (i + 1) * m + k))
            v0, v1 = lengths[i] / lengths[-1], lengths[i + 1] / lengths[-1]
            u0, u1 = perim[k] / perim[-1], perim[k + 1] / perim[-1]
            uvs.append([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
    if cap:
        last = (len(fr) - 1) * m
        faces.append(tuple(reversed(range(m)))); uvs.append([(.5 + .5 * a, .5 + .5 * b) for a, b in reversed(section)])
        faces.append(tuple(range(last, last + m))); uvs.append([(.5 + .5 * a, .5 + .5 * b) for a, b in section])
    return mesh(name, verts, faces, mat, uvs, parent, sharp)


def rounded_rect(w, h, r, steps=4):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(steps + 1):
            a = math.radians(a0 + 90 * k / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle(r, n=16, rx=None):
    return [((rx or r) * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def plate(name, outline, thickness, mat, place, bevel=.004, rings=6, parent=None, lift=None):
    """A thin metal plate: star-shaped outline, domed slightly, with a soft bevel.

    `place(x, y)` maps outline coordinates to world XY; `lift(x, y)` returns the
    world Z of the surface the plate rests on at that point.
    """
    placed = [place(x, y) for x, y in outline]
    if sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(placed, placed[1:] + placed[:1])) < 0:
        outline = outline[::-1]  # mirrored placements must keep outward-facing normals
    cx = sum(p[0] for p in outline) / len(outline); cy = sum(p[1] for p in outline) / len(outline)
    n = len(outline)
    verts, faces = [], []

    def put(x, y, z):
        wx, wy = place(x, y)
        verts.append((wx, wy, lift(wx, wy) + z)); return len(verts) - 1

    centre_top = put(cx, cy, thickness)
    top_rings = []
    for k in range(1, rings + 1):
        f = k / rings
        inset = 1 - (bevel / max(1e-6, thickness * 6)) * (k == rings) * 0
        ring = []
        for (x, y) in outline:
            px, py = cx + (x - cx) * f, cy + (y - cy) * f
            if k == rings:
                # pull the outermost ring in and down: a rounded, hand-filed edge
                dx, dy = x - cx, y - cy; d = math.hypot(dx, dy) or 1
                px, py = x - dx / d * bevel, y - dy / d * bevel
            ring.append(put(px, py, thickness * (1 - .25 * f * f)))
        top_rings.append(ring)
    edge_mid = [put(x, y, thickness * .45) for x, y in outline]
    bottom = [put(x, y, 0) for x, y in outline]
    first = top_rings[0]
    for k in range(n): faces.append((centre_top, first[k], first[(k + 1) % n]))
    for a, b in zip(top_rings, top_rings[1:] + [edge_mid]):
        for k in range(n): faces.append((a[k], b[k], b[(k + 1) % n], a[(k + 1) % n]))
    for k in range(n): faces.append((edge_mid[k], bottom[k], bottom[(k + 1) % n], edge_mid[(k + 1) % n]))
    faces.append(tuple(reversed(bottom)))
    uvs = [[(verts[i][0] * 1.7, verts[i][1] * 1.7) for i in f] for f in faces]
    return mesh(name, verts, faces, mat, uvs, parent, sharp=50)


def box_uv(o, scale=1.):
    """Triplanar box projection for metal and small props."""
    me = o.data
    layer = me.uv_layers.active or me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        n = p.normal; axis = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            a, b = [co[i] for i in range(3) if i != axis]
            layer.data[li].uv = (a * scale, b * scale)


# ── 1. Cover leather: blind-tooled relief, grain, burnish ───────────────────

print('CODEX_V4 leather', flush=True)
W, H = 1152, 1536
CX, CY = 1.631, 2.182
X, Y = np.meshgrid(np.linspace(-CX, CX, W), np.linspace(-CY, CY, H))
texel = 2 * CX / W


def groove(d, width=.0055):
    return np.exp(-(d / width) ** 2)


def rect_d(a, b):
    return np.abs(np.maximum(np.abs(X) - a, np.abs(Y) - b))


tool = np.zeros((H, W))
for a, b in ((1.466, 2.016), (1.421, 1.971), (1.376, 1.926), (1.266, 1.816), (1.236, 1.786)):
    tool = np.maximum(tool, groove(rect_d(a, b)))
# A tooled frame: small blind-stamped rosettes between the two gilt fillets.
stamp = np.zeros((H, W))


def rosette(x0, y0, r=.03):
    i0 = int((y0 + CY) / (2 * CY) * (H - 1)); j0 = int((x0 + CX) / (2 * CX) * (W - 1))
    k = int(r * 1.6 / texel) + 2
    ys, xs = slice(max(0, i0 - k), i0 + k), slice(max(0, j0 - k), j0 + k)
    dx, dy = X[ys, xs] - x0, Y[ys, xs] - y0
    rad = np.hypot(dx, dy); ang = np.arctan2(dy, dx)
    petals = np.exp(-((rad - r * .55) / (r * .22)) ** 2) * (np.cos(ang * 6) * .5 + .5) ** 2
    ring = np.exp(-((rad - r) / (r * .12)) ** 2)
    dot = np.exp(-(rad / (r * .2)) ** 2)
    stamp[ys, xs] = np.maximum(stamp[ys, xs], np.maximum(np.maximum(petals, ring * .8), dot))


band_a, band_b = 1.321, 1.871
for t in np.arange(-band_b + .09, band_b - .05, .118):
    rosette(-band_a, t); rosette(band_a, t)
for t in np.arange(-band_a + .09, band_a - .05, .118):
    rosette(t, -band_b); rosette(t, band_b)
# Diagonal fillet lattice, kept clear of the gilt title and the GD medallion.
lattice = np.zeros((H, W))
spacing = .62
for diag in (X + Y, X - Y):
    m = np.abs(((diag + spacing / 2) % spacing) - spacing / 2)
    lattice = np.maximum(lattice, np.maximum(groove(m - .011, .0045), groove(m + .011, .0045)))
panel = smooth((1.236 - np.abs(X)) / .03) * smooth((1.786 - np.abs(Y)) / .03)
title_clear = smooth((np.maximum(np.abs(X) - .78, np.maximum(.25 - Y, Y - 1.30))) / .09)
medal_clear = smooth((np.hypot(X, Y + .48) - .66) / .09)
lattice *= panel * title_clear * medal_clear
# small stamps where the lattice crosses
for i in np.arange(-6, 7):
    for j in np.arange(-6, 7):
        x0, y0 = (i + j) * spacing / 2, (i - j) * spacing / 2
        if abs(x0) < 1.17 and abs(y0) < 1.72:
            if not (abs(x0) < .86 and .17 < y0 < 1.38) and math.hypot(x0, y0 + .48) > .74: rosette(x0, y0, .022)
tooling = np.maximum(tool, np.maximum(stamp, lattice * .85))
# Grain: pores, fine pebbling and a few long creases, as in aged calfskin.
pores = noise(H, W, 260, 2, seed=3)
pebble = noise(H, W, 70, 3, seed=4)
crease_field = noise(H, W, 6, 4, seed=5)
creases = np.exp(-((crease_field - .5) / .006) ** 2) * smooth((noise(H, W, 4, 2, seed=6) - .45) / .2)
rim = smooth(np.minimum(CX - np.abs(X), CY - np.abs(Y)) / .25)
height = (-.0032 * tooling - .00028 * pores - .00045 * pebble - .0007 * creases)
height = blur(height, 1)
leather_n = normal_map(height, texel)
src = pixels(bpy.data.images['antique_leather.png'])[..., :3]
albedo = resample(src, H, W)
grime = blur(tooling, 2)
albedo *= (1 - .42 * grime)[..., None]
albedo *= (1 - .10 * creases)[..., None]
albedo *= (.93 + .1 * noise(H, W, 9, 3, seed=7))[..., None]
rough = .62 + .10 * (pebble - .5) + .22 * grime - .14 * (1 - rim) * 0 - .12 * smooth((noise(H, W, 5, 3, seed=8) - .55) / .25)
orm = np.dstack([np.ones_like(rough), np.clip(rough, .3, .95), np.zeros_like(rough)])
leather_base = image('codex_v4_calfskin_tooled.png', albedo)
leather_normal = image('codex_v4_calfskin_tooled_normal.png', leather_n, data=True)
leather_orm = image('codex_v4_calfskin_tooled_orm.png', resample(orm, H // 2, W // 2), data=True)
cover_mat = bpy.data.materials['Oxblood • hand-tooled calfskin']
for n in cover_mat.node_tree.nodes:
    if n.type == 'TEX_IMAGE':
        n.image = {'antique_leather.png': leather_base, 'calfskin_normal_v2.png': leather_normal, 'calfskin_orm_v2.png': leather_orm}.get(n.image.name, n.image)
    if n.type == 'NORMAL_MAP': n.inputs['Strength'].default_value = 1.0


# ── 2. Cushioned boards ─────────────────────────────────────────────────────

print('CODEX_V4 boards', flush=True)
CUSHION = .02


def cushion(x, y):
    """Leather over a bevelled oak board: domed towards the middle, flat at the rim."""
    sx = smooth((CX - abs(x)) / .55); sy = smooth((CY - abs(y)) / .55)
    return CUSHION * sx * sy


def on_cover(x, y):
    """World Z of the closed front cover's top surface."""
    return .8257 + cushion(x, y)


front = bpy.data.objects['Front cover']
for v in front.data.vertices:
    if v.co.z > 0:
        w = front.matrix_world @ v.co
        v.co.z += cushion(w.x, w.y) * smooth((v.co.z - .02) / .06)
for name in ('Blind-tooled rectangular border', 'Blind-tooled rectangular border.003'):
    bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
for o in [o for o in s.objects if o.name.startswith('Frayed cover corner') and o.parent == HINGE]:
    bpy.data.objects.remove(o, do_unlink=True)
# Gilt lettering, rules and the GD stamp follow the dome (converted to mesh first).
for o in [o for o in s.objects if o.parent == HINGE and o.type in {'CURVE', 'FONT', 'MESH'}]:
    if o.name.startswith(('Front cover', 'Inside cover', 'About')): continue
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    if min(p.z for p in bb) < .79: continue
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    if o.type != 'MESH': bpy.ops.object.convert(target='MESH')
    for v in o.data.vertices:
        w = o.matrix_world @ v.co
        v.co.z += cushion(w.x, w.y)


# ── 3. Brass: corner pieces, bosses, clasp catches; leather straps ──────────

print('CODEX_V4 brass', flush=True)
BW = 512
bx, by = np.meshgrid(np.linspace(0, 1, BW), np.linspace(0, 1, BW))
tarnish = smooth((noise(BW, BW, 5, 5, seed=11) - .42) / .3)
scratches = noise(BW, BW, 140, 1, seed=12)
brass_rgb = np.dstack([.78 - .30 * tarnish, .60 - .26 * tarnish, .30 - .14 * tarnish])
brass_rgb *= (.92 + .12 * scratches)[..., None]
brass_orm = np.dstack([np.ones_like(tarnish), .26 + .34 * tarnish + .08 * scratches, np.ones_like(tarnish)])
brass_base = image('codex_v4_brass.png', brass_rgb)
brass_orm_img = image('codex_v4_brass_orm.png', brass_orm, data=True)
binding_brass = material('Binding brass', base=brass_base, orm=brass_orm_img)
aged = bpy.data.materials['Aged brass']
material('Aged brass', base=brass_base, orm=brass_orm_img)
for name in ('Bronze candlestick', 'Ink bottle collar'):
    box_uv(bpy.data.objects[name], 1.5)

L, LW = .64, .15
corner_outline = [(0, 0), (L, 0), (L, LW)]
for k in range(1, 12):
    t = k / 12
    px, py = L + (LW - L) * t, LW + (L - LW) * t
    pull = .17 * math.sin(math.pi * t) - .045 * abs(math.sin(3 * math.pi * t))
    corner_outline.append((px - pull, py - pull))
corner_outline += [(LW, L), (0, L)]
# star-shaped about its centroid: reorder counter-clockwise from the corner
corner_outline = corner_outline[::-1] if sum((b[0] - a[0]) * (b[1] + a[1]) for a, b in zip(corner_outline, corner_outline[1:] + corner_outline[:1])) > 0 else corner_outline
fittings = []
for sx in (-1, 1):
    for sy in (-1, 1):
        ox, oy = sx * (CX + .004), sy * (CY + .004)
        place = lambda x, y, sx=sx, sy=sy, ox=ox, oy=oy: (ox - sx * x, oy - sy * y)
        p = plate(f'Brass corner piece {sx:+d}{sy:+d}', corner_outline, .016, binding_brass, place, lift=lambda x, y: on_cover(x, y) - .006, parent=None)
        fittings.append(p)
        # lips folded over the board edges
        z0, z1 = .628, on_cover(ox, oy) + .008
        for along_x in (True, False):
            if not along_x and sx == -1: continue  # no lip over the spine joint
            if along_x:
                xs = sorted((ox, ox - sx * L * .42)); ys = sorted((oy, oy + sy * .008))
            else:
                xs = sorted((ox, ox + sx * .008)); ys = sorted((oy, oy - sy * L * .42))
            vx = [(x, y, z) for z in (z0, z1) for y in ys for x in xs]
            lip = mesh(f'Brass corner lip {sx:+d}{sy:+d}{int(along_x)}', vx, [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)], binding_brass, sharp=30)
            box_uv(lip, 1.7); fittings.append(lip)
        # the boss, riveted through the plate
        bxw, byw = place(.25, .25)
        boss = lathe(f'Brass boss {sx:+d}{sy:+d}', [(0, 0), (.115, 0), (.118, .008), (.1, .016), (.085, .03), (.07, .055), (.045, .074), (.02, .082), (.012, .09), (0, .094)], binding_brass, loc=(bxw, byw, on_cover(bxw, byw) + .006), segments=36)
        fittings.append(boss)
for p in fittings:
    if not p.data.uv_layers or p.name.startswith('Brass boss'): box_uv(p, 1.7)
# Clasp catches on the front board, unfastened straps lying from the back board.
for sy in (-1, 1):
    yc = sy * 1.18
    catch = plate(f'Brass clasp catch {sy:+d}', rounded_rect(.2, .24, .05), .014, binding_brass, lambda x, y, yc=yc: (CX - .12 + x, yc + y), lift=lambda x, y: on_cover(x, y) - .005)
    box_uv(catch, 1.7); fittings.append(catch)
    pin = sweep(f'Brass clasp pin {sy:+d}', [(CX - .02, yc, .70), (CX + .035, yc, .70), (CX + .05, yc, .715)], circle(.014, 10), binding_brass, up=(0, 1, 0))
    box_uv(pin, 1.7); fittings.append(pin)
    lip = mesh(f'Brass clasp lip {sy:+d}', [(x, y, z) for z in (.66, on_cover(CX, yc) + .008) for y in (yc - .1, yc + .1) for x in (CX + .002, CX + .016)],
               [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)], binding_brass, sharp=30)
    box_uv(lip, 1.7); fittings.append(lip)
    # the strap leaves the back board's fore-edge, droops and settles on the desk
    drift = sy * .05
    path = [(1.50, yc, .205), (1.66, yc, .203), (1.80, yc + drift * .2, .185), (1.93, yc + drift * .45, .14), (2.05, yc + drift * .7, .095), (2.2, yc + drift * .9, .078), (2.42, yc + drift, TABLE + .012)]
    strap_section = [(x * .5, y * .5) for x, y in rounded_rect(.21, .028, .011, 2)]
    strap = sweep(f'Leather clasp strap {sy:+d}', path, strap_section, bpy.data.materials['Leather turned over the board edges'], up=(0, 0, 1))
    end = Vector(path[-1]); d = (end - Vector(path[-2])).normalized()
    clasp_outline = [(-.02, -.085), (.2, -.07), (.29, -.03), (.31, 0), (.29, .03), (.2, .07), (-.02, .085)]
    ang = math.atan2(d.y, d.x)
    ca, sa = math.cos(ang), math.sin(ang)
    clasp = plate(f'Brass clasp {sy:+d}', clasp_outline, .013, binding_brass,
                  lambda x, y, e=end, ca=ca, sa=sa: (e.x - .04 * ca + x * ca - y * sa, e.y - .04 * sa + x * sa + y * ca), lift=lambda x, y: TABLE + .02)
    box_uv(clasp, 1.7)
    hook_root = Vector((end.x + .26 * ca, end.y + .26 * sa, TABLE + .033))
    hook = sweep(f'Brass clasp hook {sy:+d}', [tuple(hook_root), tuple(hook_root + Vector((.04 * ca, .04 * sa, -.004))), tuple(hook_root + Vector((.055 * ca, .055 * sa, -.02)))], circle(.011, 8), binding_brass)
    box_uv(hook, 1.7)
    for k in (-1, 1):
        rivet_x, rivet_y = end.x + .03 * ca - k * .04 * sa, end.y + .03 * sa + k * .04 * ca
        r = lathe(f'Brass clasp rivet {sy:+d}{k:+d}', [(0, 0), (.018, 0), (.016, .008), (.008, .013), (0, .014)], binding_brass, loc=(rivet_x, rivet_y, TABLE + .031), segments=14)
        box_uv(r, 1.7)
for o in [o for o in s.objects if o.get('codex_v4') and o.name.startswith(('Brass corner', 'Brass boss', 'Brass clasp catch', 'Brass clasp pin', 'Brass clasp lip'))]:
    mw = o.matrix_world.copy(); o.parent = HINGE; o.matrix_world = mw


# ── 4. Rounded text block, gutter roll, cockled leaf ────────────────────────

print('CODEX_V4 text block', flush=True)
ROUND, GUTTER, XG = .05, .034, -1.12
ZMID, ZHALF = .468, .212


def gutter(x):
    return np.clip((XG - x) / (XG + 1.535), 0, 1) ** 2


for o in [o for o in s.objects if o.name.startswith('Aged folio')]:
    co = np.array([o.matrix_world @ v.co for v in o.data.vertices])
    t = np.clip((co[:, 2].mean() - ZMID) / ZHALF, -1, 1)
    co[:, 0] -= ROUND * (1 - t * t)
    co[:, 2] -= GUTTER * gutter(co[:, 0]) * t
    inv = o.matrix_world.inverted()
    for v, c in zip(o.data.vertices, co): v.co = inv @ Vector(c)
# Aged edges: centuries of handling yellow and dust the exposed fore-edge.
for m in [m for m in bpy.data.materials if m.name.startswith('Folio tone')]:
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = p.inputs['Base Color'].default_value
    p.inputs['Base Color'].default_value = (c[0] * .74, c[1] * .66, c[2] * .52, 1)
block = bpy.data.objects['Text block']
for v in block.data.vertices:
    v.co.x *= .985; v.co.z *= .88
# The frontispiece becomes a dense sheet so it can roll into the gutter; six
# more dense leaves sit beneath it. Closed they lie flat; the runtime lifts them
# into a fanned arch as the board swings away (the sparse folios stay put).
cockle = lambda x, y: .0022 * math.sin(x * 2.3 + 1.1) * math.sin(y * 1.7 + .4) + .0012 * math.sin(x * 5.1 + y * 3.3)


def sheet(name, mat, z, x0, x1, y0, y1, half, uvmap, nx=72, ny=48, phase=0.):
    verts, faces, uvs = [], [], []
    xs = np.linspace(x0, x1, nx); ys = np.linspace(y0, y1, ny)
    for dz in (half, -half):
        for y in ys:
            for x in xs:
                g = float(gutter(x))
                verts.append((x, y, z + dz - GUTTER * g + cockle(x + phase, y - phase) * (1 - g)))
    for layer in (0, 1):
        base = layer * nx * ny
        for j in range(ny - 1):
            for i in range(nx - 1):
                a = base + j * nx + i
                f = (a, a + 1, a + nx + 1, a + nx) if layer == 0 else (a, a + nx, a + nx + 1, a + 1)
                faces.append(f); uvs.append([uvmap(verts[k][0], verts[k][1]) for k in f])
    for ring in (list(range(nx)), [j * nx + nx - 1 for j in range(ny)], [nx * ny - 1 - i for i in range(nx)], [(ny - 1 - j) * nx for j in range(ny)]):
        for a, b in zip(ring, ring[1:]):
            f = (a, b, b + nx * ny, a + nx * ny)
            faces.append(f); uvs.append([uvmap(verts[k][0], verts[k][1]) for k in f])
    return mesh(name, verts, faces, mat, uvs)


leaf = bpy.data.objects['Frontispiece • aged rag paper']
leaf_mat = leaf.data.materials[0]
bpy.data.objects.remove(leaf, do_unlink=True)
leaf = sheet('Frontispiece • aged rag paper', leaf_mat, .683, -1.52, 1.52, -2.068, 2.068, .0015, lambda x, y: (.3289 * x + .5, .2418 * y + .5))
rag = bpy.data.materials['Warm rag paper']
rimg = {n.image.name: n.image for n in rag.node_tree.nodes if n.type == 'TEX_IMAGE'}
loose_leaf = material('Loose leaf rag paper', base=rimg['rag_paper_basecolor_v2.png'], normal=rimg['rag_paper_normal_v2.png'], orm=rimg['rag_paper_orm_v2.png'], double=True, orm_metal=False)
for k in range(6):
    j = rng.uniform(-.006, .006, 3)
    sheet(f'Loose leaf {k}', loose_leaf, .683 - .0038 * (k + 1), -1.52, 1.518 - .003 * k + j[0], -2.066 + j[1], 2.066 + j[2], .001,
          lambda x, y, k=k: (.3289 * x + .5 + .07 * k, .2418 * y + .5), nx=56, ny=40, phase=k * .7)


# ── 5. Silk marker, headbands, spine mapping ────────────────────────────────

print('CODEX_V4 marker', flush=True)
bpy.data.objects.remove(bpy.data.objects['Silk bookmark'], do_unlink=True)
ribbon = material('Oxide red ribbon', color=(.24, .025, .012), rough=.55, double=True)
mx = 1.36
leaf_top = lambda x, y: .6845 + cockle(x, y) + .0026
marker_path = [(mx, y, leaf_top(mx, y)) for y in np.linspace(.9, -1.98, 16)] + [(mx, -2.05, .683), (mx + .004, -2.085, .665), (mx + .006, -2.1, .62), (mx + .006, -2.103, .5),
               (mx + .006, -2.106, .36), (mx + .01, -2.12, .298), (mx + .015, -2.17, .286), (mx + .02, -2.198, .27), (mx + .024, -2.21, .2), (mx + .03, -2.225, .12), (mx + .04, -2.26, .083),
               (mx + .06, -2.33, TABLE + .004), (mx + .09, -2.45, TABLE + .003), (mx + .14, -2.58, TABLE + .004), (mx + .16, -2.66, TABLE + .009), (mx + .15, -2.72, TABLE + .005)]
# Bezier-like smoothing of the polyline for a soft, heavy drape.
P = [Vector(p) for p in marker_path]
for _ in range(2):
    P = [P[0]] + [a.lerp(b, f) for a, b in zip(P, P[1:]) for f in (.25, .75)] + [P[-1]]
sweep('Silk bookmark', [tuple(p) for p in P], rounded_rect(.115, .0045, .0018, 1), ribbon, up=(1, 0, 0), twist=lambda t: .25 * smooth((t - .82) / .18))

stripes = np.zeros((32, 128, 3))
u = np.linspace(0, 1, 128)[None, :]
wind = (np.sin(u * 2 * math.pi * 26) > 0)
stripes[...] = np.where(wind[..., None], (.55, .08, .05), (.86, .78, .6))
band_img = image('codex_v4_headband.png', stripes * (.85 + .15 * np.linspace(0, 1, 32)[:, None, None]))
band_mat = material('Silk headband', base=band_img, rough=.5)
for sy in (-1, 1):
    pts = []
    for k in range(13):
        t = -1 + 2 * k / 12
        z = ZMID + t * (ZHALF - .015)
        pts.append((-1.545 - ROUND * (1 - t * t), sy * 2.088, z))
    sweep(f'Silk headband {sy:+d}', pts, circle(.02, 10), band_mat, up=(0, sy, 0))


def spine_uv(o):
    me = o.data
    layer = me.uv_layers.active or me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            co = o.matrix_world @ me.vertices[me.loops[li].vertex_index].co
            phi = math.atan2(co.z - .448, -1.54 - co.x)
            layer.data[li].uv = (.5 + .3066 * phi * .33, .2292 * co.y + .5)
    o['codex_v2_uv'] = True


spine_uv(bpy.data.objects['Spine • curved calfskin over sewing supports'])
for o in [o for o in s.objects if o.name.startswith('Raised sewing support')]:
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH'); spine_uv(o)


# ── 6. Desk props ───────────────────────────────────────────────────────────

print('CODEX_V4 props', flush=True)
desk = bpy.data.collections.new('Scriptorium desk v4'); s.collection.children.link(desk)


def in_desk(o):
    for c in o.users_collection: c.objects.unlink(o)
    desk.objects.link(o); return o


glass = material('Clear glass', color=(.8, .86, .84), rough=.04, alpha=.09, double=True)
walnut = bpy.data.materials['Smoked walnut • long grain']
wimg = {n.image.name: n.image for n in walnut.node_tree.nodes if n.type == 'TEX_IMAGE'}
turned = material('Turned walnut', base=wimg['walnut_basecolor_v2.png'], normal=wimg['walnut_normal_v2.png'], orm=None, rough=.5, normal_strength=.5)

# Quill: a goose feather resting in the ink pot.
FH, FW = 1024, 256
fu, fv = np.meshgrid(np.linspace(-1, 1, FW), np.linspace(0, 1, FH))
side = np.abs(fu)
barb = np.sin((fv * 160 - side * 9) * 2 * math.pi)
edge_noise = noise(FH, FW, 3, 3, seed=21)
splits = np.zeros_like(fu)
g = np.random.default_rng(22)
for _ in range(7):
    c = g.random() * .8 + .15; sgn = g.choice((-1, 1))
    splits = np.maximum(splits, np.exp(-(((fv - c) * 160 - (side - .25) * 9) / .5) ** 2) * (side > .45) * (np.sign(fu) == sgn))
alpha = (side < (.93 - .1 * edge_noise)).astype(float) * (1 - splits) * (.86 + .14 * (barb * .5 + .5))
alpha = np.where(side < .035, 1, alpha)
alpha *= smooth(fv / .02)
tint = .93 - .5 * smooth((fv - .78) / .2) * smooth((side - .2) / .6) - .12 * smooth((.25 - fv) / .25)
rgb = np.dstack([tint * .96, tint * .93, tint * .86]) * (.9 + .1 * (barb * .5 + .5))[..., None]
rgb = np.where((side < .035)[..., None], np.array([.82, .78, .66]), rgb)
vane_img = image('codex_v4_quill_vane.png', rgb, alpha)
vane_img['codex_alpha'] = True
vane_mat = material('Goose quill vane', base=vane_img, rough=.62, double=True)
shaft_mat = material('Quill shaft', color=(.55, .5, .4), rough=.32)
ink = bpy.data.objects['Ink bottle collar']
mouth = Vector((2.7, 2.2, .6))
direction = Vector((.42, .62, .66)).normalized()
length = 3.0
spine_pts = []
for k in range(41):
    t = k / 40
    p = mouth + direction * (length * t - .45) + Vector((0, 0, -.18 * t * t))
    spine_pts.append(p)
shaft = sweep('Quill shaft', [tuple(p) for p in spine_pts], circle(.018, 8), shaft_mat, scale=lambda t: (1 - .75 * t) if t > .25 else 1 - .1 * (t / .25))
in_desk(shaft)
fr = frames([tuple(p) for p in spine_pts], up=(0, 0, 1))
verts, faces, uvs = [], [], []
cols = 9
start = 10
for k in range(start, 41):
    t = (k - start) / (40 - start)
    p, tang, sd, nrm = fr[k]
    wl = .2 * math.sin(math.pi * min(1, t * 1.15) ** .7) * (1 - .25 * t)
    wr = .13 * math.sin(math.pi * min(1, t * 1.1) ** .7) * (1 - .3 * t)
    for c in range(cols):
        f = -1 + 2 * c / (cols - 1)
        w = wl if f < 0 else wr
        off = sd * f * w + nrm * (-.05 * f * f * w * 3) + tang * (-.06 * abs(f) * w * 3)
        verts.append(tuple(p + off))
for r in range(40 - start):
    for c in range(cols - 1):
        a = r * cols + c
        faces.append((a, a + 1, a + cols + 1, a + cols))
        uvs.append([((-1 + 2 * (k % cols) / (cols - 1)) * .5 + .5, (k // cols) / (40 - start)) for k in (a, a + 1, a + cols + 1, a + cols)])
in_desk(mesh('Goose quill vane', verts, faces, vane_mat, uvs))

# Hourglass: turned walnut ends, three spindles, blown glass, falling sand.
HX, HY = -5.55, .95
sand = material('Fine sand', color=(.62, .44, .22), rough=.95)
end_profile = [(0, 0), (.36, 0), (.37, .012), (.37, .03), (.35, .04), (.33, .045), (.335, .062), (.32, .072), (0, .072)]
lathe('Hourglass foot', end_profile, turned, loc=(HX, HY, TABLE), segments=48)
lathe('Hourglass head', [(0, 0), (.32, 0), (.335, .01), (.33, .027), (.35, .032), (.37, .042), (.37, .06), (.36, .072), (0, .072)], turned, loc=(HX, HY, TABLE + 1.13), segments=48)
for k in range(3):
    a = 2 * math.pi * k / 3 + .4
    prof = [(0, 0), (.032, 0)]
    for i in range(1, 30):
        z = 1.058 * i / 30
        r = .022 + .012 * math.exp(-((z - .1) / .03) ** 2) + .012 * math.exp(-((z - .958) / .03) ** 2) + .014 * math.exp(-((z - .529) / .05) ** 2) + .004 * math.sin(z * 40)
        prof.append((r, z))
    prof += [(.032, 1.058), (0, 1.058)]
    lathe(f'Hourglass spindle {k}', prof, turned, loc=(HX + .28 * math.cos(a), HY + .28 * math.sin(a), TABLE + .072), segments=14)
bulb = []
for i in range(41):
    z = 1.04 * i / 40
    tz = abs(z - .52) / .52
    r = .028 + .19 * math.sin(math.pi * min(1, (1 - tz) * 1.0) ** .55) ** 1.3 * (1 - .15 * tz)
    r = max(r, .026) if tz > .02 else .022
    if tz > .94: r = .06 + (1 - tz) * 1.5
    bulb.append((r, z))
lathe('Hourglass glass', bulb, glass, loc=(HX, HY, TABLE + .08), segments=40)
pile = [(0, 0), (.17, 0), (.165, .05), (.13, .12), (.08, .17), (.03, .2), (0, .208)]
lathe('Hourglass sand below', pile, sand, loc=(HX, HY, TABLE + .1), segments=32)
lathe('Hourglass sand above', [(0, 0), (.03, .01), (.11, .07), (.15, .13), (.16, .16), (0, .135)], sand, loc=(HX, HY, TABLE + .08 + .53), segments=32)
lathe('Hourglass sand stream', [(0, 0), (.004, 0), (.004, .33), (0, .33)], sand, loc=(HX, HY, TABLE + .29), segments=6)
for o in [o for o in s.objects if o.name.startswith('Hourglass')]: in_desk(o)

# Sealed scroll: a real spiral of rag paper tied with linen cord, a wax seal.
paper = bpy.data.materials['Warm rag paper']
SCX, SCY, SANG = 3.55, -.55, math.radians(62)
turns, r0, r1, th = 4.2, .03, .125, .006
spiral = []
N = 140
for k in range(N + 1):
    a = turns * 2 * math.pi * k / N
    r = r0 + (r1 - r0) * k / N
    spiral.append((r * math.cos(a), r * math.sin(a)))
# an outer flap lying open on the desk
last_a = turns * 2 * math.pi
tx, ty = -math.sin(last_a), math.cos(last_a)
for k in range(1, 6):
    spiral.append((spiral[N][0] + tx * .05 * k, spiral[N][1] + ty * .05 * k - .002 * k * k))
outer = spiral
inner = []
for i, (x, y) in enumerate(spiral):
    j = min(i + 1, len(spiral) - 1); h = max(i - 1, 0)
    dx, dy = spiral[j][0] - spiral[h][0], spiral[j][1] - spiral[h][1]
    d = math.hypot(dx, dy) or 1
    inner.append((x - dy / d * th, y + dx / d * th))
section_len = len(outer)
LEN = 1.75
verts, faces, uvs = [], [], []


def scroll_point(x, y, along):
    # roll axis along local X, rotated on the desk
    lx, ly, lz = along, x, y
    wx = SCX + lx * math.cos(SANG) - ly * math.sin(SANG)
    wy = SCY + lx * math.sin(SANG) + ly * math.cos(SANG)
    return (wx, wy, TABLE + r1 + .002 + lz)


rings = 12
for e in range(rings + 1):
    along = -LEN / 2 + LEN * e / rings
    sag = .004 * math.sin(math.pi * e / rings)
    for x, y in outer: verts.append(scroll_point(x, y - sag, along))
    for x, y in inner: verts.append(scroll_point(x, y - sag, along))
stride = 2 * section_len
for e in range(rings):
    for i in range(section_len - 1):
        for off, flip in ((0, False), (section_len, True)):
            a = e * stride + off + i
            f = (a, a + 1, a + stride + 1, a + stride)
            faces.append(f[::-1] if flip else f)
            uvs.append([(i / section_len * 3, e / rings), ((i + 1) / section_len * 3, e / rings), ((i + 1) / section_len * 3, (e + 1) / rings), (i / section_len * 3, (e + 1) / rings)][::(-1 if flip else 1)])
for e, flip in ((0, True), (rings, False)):
    for i in range(section_len - 1):
        a = e * stride + i
        f = (a, a + 1, a + section_len + 1, a + section_len)
        faces.append(f[::-1] if flip else f)
        uvs.append([(.1 * i / section_len, 0)] * 4)
# open the free edge of the sheet
for e in range(rings):
    a = e * stride + section_len - 1
    f = (a, a + section_len, a + stride + section_len, a + stride)
    faces.append(f); uvs.append([(0, 0), (.01, 0), (.01, .01), (0, .01)])
in_desk(mesh('Rolled manuscript', verts, faces, paper, uvs))
cord_mat = material('Red linen cord', color=(.32, .035, .025), rough=.8)
for k, along in enumerate((-.12, .12)):
    ring_pts = []
    for i in range(29):
        a = 2 * math.pi * i / 28
        ring_pts.append(scroll_point((r1 + .012) * math.cos(a), (r1 + .012) * math.sin(a), along + .006 * math.sin(a * 3)))
    in_desk(sweep(f'Scroll cord {k}', ring_pts, circle(.011, 8), cord_mat, up=(math.cos(SANG), math.sin(SANG), 0)))
seal_at = scroll_point(0, -r1 - .26, .05)
tails = []
for k, along in enumerate((-.12, .12)):
    p0 = scroll_point(0, -r1 - .01, along)
    mid = ((p0[0] + seal_at[0]) / 2 + .03 * (k - .5), (p0[1] + seal_at[1]) / 2, TABLE + .012)
    in_desk(sweep(f'Scroll cord tail {k}', [p0, (p0[0], p0[1], TABLE + .03), mid, (seal_at[0], seal_at[1], TABLE + .012)], circle(.009, 8), cord_mat, up=(0, 0, 1)))
wax = material('Sealing wax', color=(.2, .012, .008), rough=.32, coat=.4)
seal_profile = [(0, 0), (.13, 0), (.135, .012), (.125, .028), (.105, .036), (.098, .04), (.09, .036), (.06, .034), (.055, .042), (.04, .046), (.02, .044), (0, .046)]
in_desk(lathe('Wax seal', seal_profile, wax, loc=(seal_at[0], seal_at[1], TABLE), segments=36, wobble=.06, seed=31))

# Rivet spectacles of horn, folded on the desk.
horn = material('Horn spectacles', color=(.045, .025, .012), rough=.28, coat=.25)
SPX, SPY, SPA = -2.55, -3.35, math.radians(18)
for k, sgn in enumerate((-1, 1)):
    cx, cy = SPX + sgn * .2 * math.cos(SPA), SPY + sgn * .2 * math.sin(SPA)
    tilt = .05 if sgn > 0 else 0
    ring_pts = [(cx + .165 * math.cos(2 * math.pi * i / 32), cy + .165 * math.sin(2 * math.pi * i / 32), TABLE + .03 + tilt * (1 + math.cos(2 * math.pi * i / 32)) * .5) for i in range(33)]
    in_desk(sweep(f'Spectacle rim {k}', ring_pts, rounded_rect(.05, .045, .015, 2), horn, up=(0, 0, 1)))
    lens = [(.15, 0), (.12, .006), (.06, .009), (0, .01)]
    o = lathe(f'Spectacle lens {k}', [(0, -.008)] + [(r, z - .002) for r, z in reversed([(0, -.008), (.15, -.002)])] + lens, glass, loc=(cx, cy, TABLE + .03 + tilt * .5), segments=32)
    o.rotation_euler = (math.atan2(tilt, .33) * (1 if sgn > 0 else 0) * math.sin(SPA), -math.atan2(tilt, .33) * math.cos(SPA) * (1 if sgn > 0 else 0), 0)
    in_desk(o)
    stem_end = (SPX + .02 * sgn - .32 * math.sin(SPA), SPY + .38 * math.cos(SPA) * (1 if sgn < 0 else .9) - .05 * sgn, TABLE + .03)
    start_pt = (cx - .14 * math.sin(SPA) + .05 * sgn * math.cos(SPA), cy + .14 * math.cos(SPA), TABLE + .03 + tilt * .5)
    in_desk(sweep(f'Spectacle shank {k}', [start_pt, ((start_pt[0] + stem_end[0]) / 2, (start_pt[1] + stem_end[1]) / 2, TABLE + .028), stem_end], rounded_rect(.045, .03, .012, 2), horn))
rv = lathe('Spectacle rivet', [(0, 0), (.022, 0), (.02, .01), (0, .014)], binding_brass, loc=(SPX - .32 * math.sin(SPA), SPY + .33 * math.cos(SPA), TABLE + .043), segments=14)
box_uv(rv, 1.7); in_desk(rv)

# Iron-gall stains and dried wax: the desk has been worked at.
SW = 512
su, sv = np.meshgrid(np.linspace(-1, 1, SW), np.linspace(-1, 1, SW))
ang = np.arctan2(sv, su); rad = np.hypot(su, sv)
edge = .5 + .05 * np.sin(ang * 2 + 1) + .3 * (noise(SW, SW, 2, 5, seed=41) - .5)
blot = smooth((edge - rad) / .02)
ring_dark = np.exp(-((rad - edge + .02) / .025) ** 2) * blot
spatter = np.zeros_like(rad)
g = np.random.default_rng(42)
for _ in range(26):
    a = g.random() * 2 * math.pi; d = .6 + g.random() * .35; r = .008 + g.random() ** 3 * .05
    spatter = np.maximum(spatter, smooth((r - np.hypot(su - d * math.cos(a), sv - d * math.sin(a))) / .006))
ink_alpha = np.clip(blot * (.32 + .25 * noise(SW, SW, 10, 3, seed=43)) + ring_dark * .3 + spatter * .55, 0, .8)
stain_img = image('codex_v4_ink_stain.png', np.dstack([np.full_like(rad, .07), np.full_like(rad, .05), np.full_like(rad, .035)]), ink_alpha)
stain_img['codex_alpha'] = True
stain_mat = material('Iron gall stain', base=stain_img, rough=.45)
for k, (x, y, r, a) in enumerate(((3.2, 1.62, .42, .3), (-1.15, 3.55, .26, 2.0), (2.25, -3.05, .2, 4.0))):
    c, sn = math.cos(a), math.sin(a)
    quad = [(x + c * dx * r - sn * dy * r, y + sn * dx * r + c * dy * r, TABLE + .0035 + k * .0004) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    in_desk(mesh(f'Iron gall stain {k}', quad, [(0, 1, 2, 3)], stain_mat, [[(0, 0), (1, 0), (1, 1), (0, 1)]]))
beeswax = material('Spilled beeswax', color=(.6, .4, .17), rough=.55)
g = np.random.default_rng(51)
for k in range(4):
    a = g.random() * 2 * math.pi; d = .48 + g.random() * .22; r = .02 + g.random() * .025
    in_desk(lathe(f'Wax drop {k}', [(0, 0), (r, 0), (r * .8, r * .25), (r * .4, r * .4), (0, r * .42)], beeswax, loc=(-3.4 + d * math.cos(a), 2.8 + d * math.sin(a), TABLE - .002), segments=14, wobble=.12, seed=k))


# ── 7. Contact occlusion baked onto the desk ────────────────────────────────

print('CODEX_V4 bake', flush=True)
AX0, AX1, AY0, AY1 = -6.6, 6.2, -5.0, 6.6
AW = 1024; AH = int(AW * (AY1 - AY0) / (AX1 - AX0))
ao_img = bpy.data.images.new('codex_v4_contact_ao.png', AW, AH, alpha=False)
ao_img.colorspace_settings.name = 'Non-Color'
# Exported as a plain textured plane; the runtime turns it into a darkening decal.
ao_mat = material('Contact occlusion', base=ao_img, rough=1)
ao_mat.node_tree.nodes.active = next(n for n in ao_mat.node_tree.nodes if n.type == 'TEX_IMAGE')
contact = mesh('CONTACT_AO', [(AX0, AY0, TABLE + .006), (AX1, AY0, TABLE + .006), (AX1, AY1, TABLE + .006), (AX0, AY1, TABLE + .006)], [(0, 1, 2, 3)], ao_mat, [[(0, 0), (1, 0), (1, 1), (0, 1)]])
hidden = []
for o in s.objects:
    moving = o.parent == HINGE or (o.parent and o.parent.parent == HINGE)
    if moving or o.name.startswith(('Walnut plank', 'Iron gall stain', 'Small flame', 'PORTFOLIO')) or o.type == 'LIGHT':
        if not o.hide_render: hidden.append(o); o.hide_render = True
s.render.engine = 'CYCLES'
s.cycles.samples = 512
s.cycles.device = 'CPU'
s.world.light_settings.distance = .9
bpy.ops.object.select_all(action='DESELECT'); contact.select_set(True); bpy.context.view_layer.objects.active = contact
bpy.ops.object.bake(type='AO', margin=4)
for o in hidden: o.hide_render = False
ao = pixels(ao_img)[..., 0]
occ = np.clip((1 - ao - .03) * 1.35, 0, 1) ** 1.15
occ = blur(occ, 3)
image('codex_v4_contact_ao.png', np.dstack([occ, occ, occ]), data=True)
s.render.engine = 'BLENDER_EEVEE'

bpy.ops.object.select_all(action='DESELECT')
s.frame_set(18)
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'Codex_Studio_v4.blend'))
print('CODEX_V4_SAVED', out / 'Codex_Studio_v4.blend', flush=True)
if '--no-export' not in sys.argv:
    __file__ = str(root / 'scripts/export-codex-v4.py')
    exec(compile(Path(__file__).read_text(encoding='utf8'), __file__, 'exec'))
