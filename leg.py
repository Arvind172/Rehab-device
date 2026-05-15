from vpython import *
from math import sin

scene = canvas(width=900, height=700, background=color.black)
scene.title = "3D Leg Model"

# segment lengths
thigh_len = 4
shin_len = 4
foot_len = 2

# hip joint
hip = vector(0,0,0)

# thigh
thigh = cylinder(pos=hip, axis=vector(0,-thigh_len,0), radius=0.4, color=color.blue)

# knee position
knee = hip + thigh.axis

# shin
shin = cylinder(pos=knee, axis=vector(0,-shin_len,0), radius=0.35, color=color.green)

# ankle position
ankle = knee + shin.axis

# foot
foot = box(pos=ankle + vector(foot_len/2,0,0),
           size=vector(foot_len,0.6,1.5),
           color=color.red)

# joint markers
sphere(pos=hip, radius=0.2, color=color.white)
sphere(pos=knee, radius=0.2, color=color.white)
sphere(pos=ankle, radius=0.2, color=color.white)

t = 0

while True:
    rate(60)

    knee_angle = 0.8*sin(t)
    ankle_angle = 0.4*sin(t*1.3)

    # update shin rotation
    shin.axis = vector(0,-shin_len*cos(knee_angle), shin_len*sin(knee_angle))

    # recompute ankle
    ankle = knee + shin.axis
    shin.pos = knee

    # update foot rotation
    foot.pos = ankle + vector(foot_len/2*cos(ankle_angle),
                              -foot_len/2*sin(ankle_angle),
                              0)

    t += 0.05