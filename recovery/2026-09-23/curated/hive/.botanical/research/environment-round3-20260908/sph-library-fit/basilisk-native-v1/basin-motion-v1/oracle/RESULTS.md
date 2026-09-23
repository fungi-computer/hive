# Linear standing-wave reference acceptance

Root authored the independent potential/pressure/velocity/energy reference.
The water author personally read its signs, interface conditions and integrated
kinetic normalization before execution. Its two API comments were addressed:
finite derived scales and an explicit small-steepness bound. No fluid kernel
or tank pressure was modified by these reference queries.

One mathematical packet u3264 / invocation3683c58385364b3f944f869af4ac44df
exited0:326checks in8.296ms. Reference omega=5.361495919223879/s and
period=1.171908997384657s. Independent finite-difference maximum divergence
5.291e-12/s, Euler momentum residual4.697e-12m/s2, interface-pressure residual
7.11e-15Pa. Simpson kinetic quadrature relative errors at16/32/64 subdivisions
were1.1174e-5/7.0120e-7/4.3869e-8. The proof additionally checks wall/interface
kinematics, phase-energy normalization, small-air limit and invalid input.

This qualifies the linear oracle, **not a numerical water simulation**. It does
not bound all finite-amplitude errors, prove a timestep, or cover ledges/3D.

Fallow target inspection u3265 /9165a0d013094441bfd55f944ce4a1ee exited0.
Root read actual JSON. No dead export/file/cycle/clone findings. Two estimated-
coverage advisories remain: field cognitive10/cyclomatic13 and factory
cognitive3/cyclomatic6. Actual mathematical checks are recorded separately;
no suppression, coverage claim or artificial refactor was made.

Accepted source SHA256:

- oracle.mjs:1b9ae075cc53816831945a0f9f8f023f6bf395da53352ac4dfe8ceeb02076c84
- CONTRACT.md:db3d6c758b963126ca53b43544d3d2cf3e4054fcd71371fff33b91331b1c3755
- check.mjs:5719db7119bf64c81aa443cc87be87fdb5fdecc1d0c354c295264257ec572737

The motion caller may now consume the frozen oracle as an independent observer.
It still requires root source/caller acceptance before its physical packet.
