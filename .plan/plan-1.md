Berikut file-file terkait terrain dan pencahayaan (sama format seperti World.js). Saya sertakan: Floor.js, WaterSurface.js, MeshDefaultMaterial.js, Ligthing.js (penamaan file di repo), dan Terrain.js — masing-masing dengan tautan ke file di GitHub.

```javascript name=sources/Game/World/Floor.js url=https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/World/Floor.js
import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { color, float, Fn, materialNormal, min, mix, mul, normalWorld, positionLocal, positionWorld, texture, uniform, uv, vec3, vec4 } from 'three/tsl'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'

export class Floor
{
    constructor()
    {
        this.game = Game.getInstance()

        // Debug
        if(this.game.debug.active)
        {
            this.debugPanel = this.game.debug.panel.addFolder({
                title: '⏥ Floor',
                expanded: false,
            })
        }
        this.geometry = this.game.resources.terrainModel.scene.children[0].geometry
        this.subdivision = this.game.terrain.subdivision

        this.setVisual()
        this.setPhysical()
        this.setBedRock()

        this.game.ticker.events.on('tick', () =>
        {
            this.update()
        }, 10)
    }

    setVisual()
    {
        this.size = Math.round(this.game.view.optimalArea.radius * 2) + 1
        this.halfSize = this.size * 0.5
        this.cellSize = 1.5
        this.subdivisions = this.size / this.cellSize

        // Geometry
        let geometry = new THREE.PlaneGeometry(this.size, this.size, this.subdivisions, this.subdivisions)
        geometry.rotateX(-Math.PI * 0.5)
        geometry.deleteAttribute('normal')

        // Terrain data
        const terrainData = this.game.terrain.terrainNode(positionWorld.xz)
        const slabHighColor = uniform(color('#ffcf8b'))
        const slabLowColor = uniform(color('#a87762'))
        const slabTextureFrequency = uniform(0.175)
        const slabNoiseFrequency = uniform(0.03)
        const colorNode = Fn(() =>
        {
            const baseColor = this.game.terrain.colorNode(terrainData)
            
            const slabTerrain = terrainData.r
            const slabNoiseUv = positionWorld.xz.mul(slabNoiseFrequency)
            const slabNoise = texture(this.game.noises.perlin, slabNoiseUv).r
            const slabsTexture = texture(this.game.resources.floorSlabsTexture, positionWorld.xz.mul(slabTextureFrequency)).r
            const slabColor = mix(slabLowColor, slabHighColor, slabsTexture)
            // return vec3(slabsTexture.mul(slabStrength))

            const slab = slabTerrain.mul(slabNoise)
            // return vec3(slab)
            
            const finalColor = mix(baseColor, slabColor, slab)
            return finalColor
        })()

        // Material
        const material = new MeshDefaultMaterial({
            colorNode: colorNode,
            normalNode: vec3(0, 1, 0),
            shadowNode: terrainData.g,
            hasWater: false,
            hasLightBounce: false,
            wireframe: false
        })
        // Displacement
        material.positionNode = Fn(() =>
        {
            const uvDim = min(min(uv().x, uv().y).mul(20), 1)

            const newPosition = positionLocal
            newPosition.y.addAssign(terrainData.b.mul(-1.5).mul(uvDim))

            return newPosition
        })()

        // Mesh
        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.receiveShadow = true
        // this.mesh.castShadow = true
        this.game.scene.add(this.mesh)

        // Resize
        this.game.viewport.events.on('throttleChange', () =>
        {
            this.size = Math.round(this.game.view.optimalArea.radius * 2) + 1
            this.halfSize = this.size * 0.5
            this.subdivisions = this.size
            
            geometry.dispose()
            
            geometry = new THREE.PlaneGeometry(this.size, this.size, this.subdivisions, this.subdivisions)
            geometry.rotateX(-Math.PI * 0.5)
            geometry.deleteAttribute('normal')

            this.mesh.geometry = geometry
        }, 2)

        if(this.game.debug.active)
        {
            this.debugPanel.addBinding(slabTextureFrequency, 'value', { label: 'slabTextureFrequency', min: 0, max: 1, step: 0.001 })
            this.debugPanel.addBinding(slabNoiseFrequency, 'value', { label: 'slabNoiseFrequency', min: 0, max: 0.1, step: 0.001 })
            this.game.debug.addThreeColorBinding(this.debugPanel, slabHighColor.value, 'slabHighColor')
            this.game.debug.addThreeColorBinding(this.debugPanel, slabLowColor.value, 'slabLowColor')
        }
    }

    setPhysical()
    {
        // Extract heights from geometry
        const positionAttribute = this.geometry.attributes.position
        const totalCount = positionAttribute.count
        const rowsCount = Math.sqrt(totalCount)
        const heights = new Float32Array(totalCount)
        const halfExtent = this.game.terrain.size / 2

        for(let i = 0; i < totalCount; i++)
        {
            const x = positionAttribute.array[i * 3 + 0]
            const y = positionAttribute.array[i * 3 + 1]
            const z = positionAttribute.array[i * 3 + 2]
            const indexX = Math.round(((x / (halfExtent * 2)) + 0.5) * (rowsCount - 1))
            const indexZ = Math.round(((z / (halfExtent * 2)) + 0.5) * (rowsCount - 1))
            const index = indexZ + indexX * rowsCount

            heights[index] = y
        }

        const object = this.game.objects.add(
            null,
            {
                type: 'fixed',
                friction: 0.2,
                restitution: 0.15,
                colliders: [
                    { shape: 'heightfield', parameters: [ rowsCount - 1, rowsCount - 1, heights, { x: this.game.terrain.size, y: 1, z: this.game.terrain.size } ], category: 'floor' }
                ]
            }
        )
        this.physical = object.physical
    }

    setBedRock()
    {
        this.bedRock = {}
        this.bedRock.halfHeight = 0.5
        this.bedRock.halfWidth = 6
        this.bedRock.enabled = false


        this.bedRock.physical = this.game.physics.getPhysical({
            type: 'kinematicPositionBased',
            position: new THREE.Vector3(0, this.game.water.depthElevation - this.bedRock.halfHeight, 0),
            frictionRule: 'min',
            friction: 0.5,
            enabled: true,
            colliders:
            [
                { shape: 'cuboid', parameters: [ this.bedRock.halfWidth, this.bedRock.halfHeight, this.bedRock.halfWidth ] },
            ]
        })
    }

    update()
    {
        this.mesh.position.x = Math.round(this.game.view.optimalArea.position.x / this.cellSize) * this.cellSize
        this.mesh.position.z = Math.round(this.game.view.optimalArea.position.z / this.cellSize) * this.cellSize

        // Bedrock
        if(
            Math.abs(this.game.player.position.x) > this.game.terrain.size / 2 - this.bedRock.halfWidth ||
            Math.abs(this.game.player.position.z) > this.game.terrain.size / 2 - this.bedRock.halfWidth
        )
        {
            if(!this.bedRock.enabled)
            {
                this.bedRock.enabled = true
                this.bedRock.physical.body.setEnabled(true)
            }
            const x = Math.round(this.game.player.position.x)
            const z = Math.round(this.game.player.position.z)
            this.bedRock.physical.body.setNextKinematicTranslation({
                x,
                y: this.game.water.depthElevation - this.bedRock.halfHeight,
                z
            })
            this.bedRock.physical.body.setLinvel({ x: 0, y: 0, z: 0 })
        }
        else
        {
            if(this.bedRock.enabled)
            {
                this.bedRock.enabled = false
                this.bedRock.physical.body.setEnabled(false)
            }
        }
    }
}
```

```javascript name=sources/Game/World/WaterSurface.js url=https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/World/WaterSurface.js
import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { blendOverlay, color, float, Fn, hash, linearDepth, max, mix, output, positionGeometry, positionLocal, positionWorld, screenUV, select, sin, smoothstep, step, texture, uniform, uv, vec2, ve[...]
import { lerp, remap, remapClamp } from '../utilities/maths.js'
import { hashBlur } from 'three/examples/jsm/tsl/display/hashBlur.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { boxBlur } from 'three/examples/jsm/tsl/display/boxBlur.js'

export class WaterSurface
{
    constructor()
    {
        this.game = Game.getInstance()

        this.hasRipples = false
        this.hasIce = false
        this.hasSplashes = false

        // Debug
        if(this.game.debug.active)
        {
            this.debugPanel = this.game.debug.panel.addFolder({
                title: '🌊 Water surface',
                expanded: false,
            })

            this.ripplesDebugPanel = this.debugPanel.addFolder({
                title: 'Ripples',
                expanded: true,
            })

            this.iceDebugPanel = this.debugPanel.addFolder({
                title: 'Ice',
                expanded: true,
            })

            this.splashesDebugPanel = this.debugPanel.addFolder({
                title: 'Splashes',
                expanded: true,
            })

            this.shoreDebugPanel = this.debugPanel.addFolder({
                title: 'shore',
                expanded: true,
            })

            this.blurDebugPanel = this.debugPanel.addFolder({
                title: 'blur',
                expanded: true,
            })
        }

        this.setGeometry()
        this.setNodes()
        this.setMaterial()
        this.setMesh()
        this.setIce()

        this.game.ticker.events.on('tick', () =>
        {
            this.update()
        }, 10)
    }

    setGeometry()
    {
        this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1)
        this.geometry.rotateX(- Math.PI * 0.5)
    }

    setNodes()
    {
        /**
         * Ripples
         */
        this.ripplesRatio = uniform(1)
        const ripplesSlopeFrequency = uniform(10)
        const ripplesNoiseFrequency = uniform(0.1)
        const ripplesNoiseOffset = uniform(0.345)

        this.ripplesRatioBinding = this.game.debug.addManualBinding(
            this.ripplesDebugPanel,
            this.ripplesRatio,
            'value',
            { label: 'ripplesRatio', min: 0, max: 1, step: 0.001 },
            () =>
            {
                return remapClamp(this.game.weather.temperature.value, 0, -3, 1, 0)
            }
        )

        const ripplesNode = Fn(([terrainData]) =>
        {           
            const baseRipple = terrainData.b.add(this.game.wind.localTime.mul(0.5)).mul(ripplesSlopeFrequency)
            const rippleIndex = baseRipple.floor()

            const ripplesNoise = texture(
                this.game.noises.perlin,
                positionWorld.xz.add(rippleIndex.div(ripplesNoiseOffset)).mul(ripplesNoiseFrequency)
            ).r
            
            const ripples = terrainData.b
                .add(this.game.wind.localTime.mul(0.5))
                .mul(ripplesSlopeFrequency)
                .mod(1)
                .sub(terrainData.b.remap(0, 1, -0.3, 1).oneMinus())
                .add(ripplesNoise)

            ripples.assign(this.ripplesRatio.remap(0, 1, -1, -0.4).step(ripples))

            return ripples
        })

        // Debug
        if(this.game.debug.active)
        {
            this.ripplesDebugPanel.addBinding(ripplesSlopeFrequency, 'value', { label: 'ripplesSlopeFrequency', min: 0, max: 50, step: 0.01 })
            this.ripplesDebugPanel.addBinding(ripplesNoiseFrequency, 'value', { label: 'ripplesNoiseFrequency', min: 0, max: 1, step: 0.01 })
            this.ripplesDebugPanel.addBinding(ripplesNoiseOffset, 'value', { label: 'ripplesNoiseOffset', min: 0, max: 1, step: 0.001 })
        }

        /**
         * Ice
         */
        this.iceRatio = uniform(0)
        const iceNoiseFrequency = uniform(0.3)

        this.iceRatioBinding = this.game.debug.addManualBinding(
            this.iceDebugPanel,
            this.iceRatio,
            'value',
            { label: 'iceRatio', min: 0, max: 1, step: 0.001 },
            () =>
            {
                return remapClamp(this.game.weather.temperature.value, 0, -5, 0, 1)
            }
        )

        const iceNode = Fn(([terrainData]) =>
        {
            const iceVoronoi = texture(
                this.game.noises.voronoi,
                positionWorld.xz.mul(iceNoiseFrequency)
            ).g

            const ice = terrainData.b.remapClamp(0, this.iceRatio, 0, 1).toVar()
            ice.assign(iceVoronoi.step(ice))

            return ice
        })

        // Debug
        if(this.game.debug.active)
        {
            this.iceDebugPanel.addBinding(iceNoiseFrequency, 'value', { label: 'iceNoiseFrequency', min: 0, max: 1, step: 0.01 })
        }

        /**
         * Splashes
         */
        this.splashesRatio = uniform(0)
        const splashesNoiseFrequency = uniform(0.33)
        const splashesTimeFrequency = uniform(6)
        const splashesThickness = uniform(0.3)
        const splashesEdgeAttenuationLow = uniform(0.14)
        const splashesEdgeAttenuationHigh = uniform(1)

        this.splashesRatioBinding = this.game.debug.addManualBinding(
            this.splashesDebugPanel,
            this.splashesRatio,
            'value',
            { label: 'splashesRatio', min: 0, max: 1, step: 0.001 },
            () =>
            {
                return Math.pow(this.game.weather.rain.value, 2)
            }
        )

        const splashesNode = Fn(() =>
        {
            // Noises
            const splashesVoronoi = texture(
                this.game.noises.voronoi,
                positionWorld.xz.mul(splashesNoiseFrequency)
            )
            const splashPerlin = texture(
                this.game.noises.perlin,
                positionWorld.xz.mul(splashesNoiseFrequency.mul(0.25))
            ).r

            // Base
            const splash = splashesVoronoi.r

            // Time
            const splashTimeRandom = hash(splashesVoronoi.b.mul(123456)).add(splashPerlin)
            const splashTime = this.game.wind.localTime.mul(splashesTimeFrequency).add(splashTimeRandom)
            splash.assign(splash.sub(splashTime).mod(1))
            
            // Thickness
            const edgeMutliplier = splashesVoronoi.g.remapClamp(splashesEdgeAttenuationLow, splashesEdgeAttenuationHigh, 0, 1)
            const thickness = splashesThickness.mul(edgeMutliplier)
            splash.assign(splash.step(thickness).oneMinus())
            
            // Visibility
            const splashVisibilityRandom = hash(splashesVoronoi.b.mul(654321))
            const visible = splashVisibilityRandom.add(splashPerlin).mod(1)
            visible.assign(this.splashesRatio.step(visible))
            splash.assign(splash.mul(visible))
            
            return splash
        })

        // Debug
        if(this.game.debug.active)
        {
            this.splashesDebugPanel.addBinding(splashesNoiseFrequency, 'value', { label: 'splashesNoiseFrequency', min: 0, max: 1, step: 0.01 })
            this.splashesDebugPanel.addBinding(splashesTimeFrequency, 'value', { label: 'splashesTimeFrequency', min: 0, max: 100, step: 0.1 })
            this.splashesDebugPanel.addBinding(splashesThickness, 'value', { label: 'splashesThickness', min: 0, max: 1, step: 0.01 })
            this.splashesDebugPanel.addBinding(splashesEdgeAttenuationLow, 'value', { label: 'splashesEdgeAttenuationLow', min: 0, max: 1, step: 0.01 })
            this.splashesDebugPanel.addBinding(splashesEdgeAttenuationHigh, 'value', { label: 'splashesEdgeAttenuationHigh', min: 0, max: 1, step: 0.01 })
        }

        /**
         * Shore
         */
        const shoreEdge = uniform(0.17)
        
        const shoreNode = Fn(([terrainData]) =>
        {
            return shoreEdge.step(terrainData.b)
        })

        // Debug
        if(this.game.debug.active)
        {
            this.shoreDebugPanel.addBinding(shoreEdge, 'value', { label: 'shoreEdge', min: 0, max: 0.3, step: 0.001 })
        }

        /**
         * Details mask
         */
        this.detailsMask = () =>
        {
            return Fn(() =>
            {
                // Terrain data
                // const terrainUv = this.game.terrain.worldPositionToUvNode(positionWorld.xz)
                const terrainData = this.game.terrain.terrainNode(positionWorld.xz)
                const value = float(0)

                // Ripples
                if(this.hasRipples)
                    value.assign(max(value, ripplesNode(terrainData)))

                // Ice
                if(this.hasIce)
                    value.assign(max(value, iceNode(terrainData)))
            
                // Splashes
                if(this.hasSplashes)
                    value.assign(max(value, splashesNode()))

                // Shore
                value.assign(max(value, shoreNode(terrainData)))

                return value
            })()
        }

        /**
         * Blur Output
         */
         const blurStrength = uniform(0.01)

         this.blurOutputNode = Fn(() =>
         {
            // const blurOutput = boxBlur(viewportSharedTexture(screenUV), {
            //  size: 1.5,
            //  separation: 3
            // }).rgb

            // Hash blur
            const blurOutput = hashBlur(viewportSharedTexture(screenUV), 0.01, {
                repeats: 25,
                premultipliedAlpha: true
            })

            return vec3(blurOutput)
         })

        // Debug
        if(this.game.debug.active)
        {
            this.blurDebugPanel.addBinding(blurStrength, 'value', { label: 'blurStrength', min: 0, max: 0.1 })
        }
    }

    setMaterial()
    {
        const material = new MeshDefaultMaterial({
            depthWrite: false,
            colorNode: color(0xffffff),
            alphaNode: this.detailsMask(),
            alphaTest: 0,
            hasCoreShadows: false,
            hasDropShadows: true,
            hasLightBounce: false,
            hasFog: true,
            hasWater: false,
            transparent: true
        })

        const baseOutput = material.outputNode
        const blurredOutput = Fn(() =>
        {
            const blurOutput = this.blurOutputNode()
            const surfaceAlpha = baseOutput.a
            const surfaceOutput = vec4(baseOutput.rgb, 1)

            const finalOuput = select(
                surfaceAlpha.lessThan(0.5),
                blurOutput,
                surfaceOutput
            )

            return finalOuput
        })()

        // Quality
        const qualityChange = (level) =>
        {
            if(level === 0)
            {
                material.outputNode = blurredOutput
            }
            else if(level === 1)
            {
                material.outputNode = baseOutput
            }
            
            material.needsUpdate = true
        }
        qualityChange(this.game.quality.level)
        this.game.quality.events.on('change', qualityChange)


        // const baseOutput = material.outputNode
        // material.outputNode = Fn(() =>
        // {
        //     const blurOutput = this.blurOutputNode()
        //     const surfaceAlpha = baseOutput.a
        //     const surfaceOutput = vec4(baseOutput.rgb, 1)

        //     const finalOuput = select(
        //         surfaceAlpha.lessThan(0.5),
        //         blurOutput,
        //         surfaceOutput
        //     )

        //     return finalOuput
        // })()
        
        material.maskShadowNode = this.detailsMask().greaterThan(0.5)

        // Already exist
        if(this.material)
        {
            this.material.dispose()
            this.material = material
            this.mesh.material = this.material
        }

        // Don't exist yet
        else
        {
            this.material = material
        }
    }

    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        
        const halfExtent = this.game.view.optimalArea.radius
        this.mesh.scale.setScalar(halfExtent * 2)

        this.mesh.position.y = this.game.water.surfaceElevation
        this.mesh.castShadow = true
        this.mesh.receiveShadow = true
        // this.mesh.renderOrder = -1
        this.game.scene.children.unshift(this.mesh)

        this.game.viewport.events.on('throttleChange', () =>
        {
            const halfExtent = this.game.view.optimalArea.radius
            this.mesh.scale.setScalar(halfExtent * 2)
        }, 2)
    }

    setIce()
    {
        this.ice = {}

        this.ice.halfThickness = 0.5
        this.ice.physical = this.game.physics.getPhysical({
            type: 'kinematicPositionBased',
            position: new THREE.Vector3(0, this.game.water.surfaceElevation - this.ice.halfThickness, 0),
            frictionRule: 'min',
            friction: 0.02,
            enabled: false,
            colliders:
            [
                { shape: 'cuboid', parameters: [ 256, this.ice.halfThickness, 256 ] },
            ]
        })
    }

    update()
    {
        // Apply weather
        this.ripplesRatioBinding.update()
        this.iceRatioBinding.update()
        this.splashesRatioBinding.update()

        // Mesh
        this.mesh.position.x = this.game.view.optimalArea.position.x
        this.mesh.position.z = this.game.view.optimalArea.position.z
        this.mesh.renderOrder = 1

        // Material
        const hasRipples = this.ripplesRatio.value > 0.0001
        const hasIce = this.iceRatio.value > 0.0001
        const hasSplashes = this.splashesRatio.value > 0.0001

        if(
            hasRipples !== this.hasRipples ||
            hasIce !== this.hasIce ||
            hasSplashes !== this.hasSplashes
        )
        {
            this.hasRipples = hasRipples
            this.hasIce = hasIce
            this.hasSplashes = hasSplashes
            
            this.setMaterial()
        }

        // Ice
        const friction = lerp(0.5, 0.02, this.iceRatio.value)
        this.ice.physical.body.collider(0).setFriction(friction)
        this.ice.physical.body.setNextKinematicTranslation({ x: 0, y: lerp(- 1.5 - this.ice.halfThickness, this.game.water.surfaceElevation - this.ice.halfThickness, this.iceRatio.value), z: 0})

        if(this.iceRatio.value > 0)
        {
            if(!this.ice.physical.body.isEnabled())
            {
                this.game.objects.enable(this.ice)
            }
        }
        else
        {
            if(this.ice.physical.body.isEnabled())
            {
                this.game.objects.disable(this.ice)
            }
        }
    }
}
```

```javascript name=sources/Game/Materials/MeshDefaultMaterial.js url=https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/Materials/MeshDefaultMaterial.js
import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { Fn, color, float, frontFacing, If, max, mix, normalWorld, positionWorld, vec2, vec3, vec4 } from 'three/tsl'

export class MeshDefaultMaterial extends THREE.MeshLambertNodeMaterial
{
    static revealDiscardNodeBuilder = (game, outputColor) =>
    {
        return Fn(([ outputColor ]) =>
        {
            const distanceToCenter = positionWorld.xz.sub(game.reveal.position2Uniform).length()
            distanceToCenter.greaterThan(game.reveal.distance).discard()

            const revealMix = distanceToCenter.step(game.reveal.distance.sub(game.reveal.thickness))
            // const revealMix = game.reveal.distance.sub(distanceToCenter).oneMinus().max(0).pow(4)
            const revealColor = game.reveal.color.mul(game.reveal.intensity)
            return mix(outputColor.rgb, revealColor, revealMix)
        })(outputColor)
    }
    
    constructor(parameters = {})
    {
        super()

        this.game = Game.getInstance()

        this.depthWrite = parameters.depthWrite ?? true
        this.depthTest = parameters.depthTest ?? true
        this.side = parameters.side ?? THREE.FrontSide
        this.wireframe = parameters.wireframe ?? false
        this.transparent = parameters.transparent ?? false
        this.shadowSide = parameters.shadowSide ?? THREE.FrontSide

        this.hasCoreShadows = parameters.hasCoreShadows ?? true
        this.hasDropShadows = parameters.hasDropShadows ?? true
        this.hasLightBounce = parameters.hasLightBounce ?? true
        this.hasFog = parameters.hasFog ?? true
        this.hasWater = parameters.hasWater ?? true
        this.hasReveal = parameters.hasReveal ?? true

        this._colorNode = parameters.colorNode ?? color(0xffffff)
        this._normalNode = parameters.normalNode ?? normalWorld
        this._alphaNode = parameters.alphaNode ?? float(1)
        this._shadowNode = parameters.shadowNode ?? float(0)
        this.alphaTest = parameters.alphaTest ?? 0.1

        this.normalNode = this._normalNode // Get rid of warning
        
        /**
         * Shadow catcher
         * Catch shadow as a float and remove it from initial pipeline
         */
        const catchedShadow = float(1).toVar()

        if(this.hasDropShadows)
        {
            this.receivedShadowNode = Fn(([ shadow ]) => 
            {
                catchedShadow.mulAssign(shadow.r)
                return float(1)
            })
        }

        /**
         * Output node
         */
        this.outputNode = Fn(() =>
        {
            const baseColor = this._colorNode.toVar()
            const outputColor = this._colorNode.toVar()
            // outputColor.assign(vec3(0))
            // outputColor.assign(vec3(0.8))

            // Normal orientation
            const reorientedNormal = this._normalNode.toVar()
            if(this.side === THREE.DoubleSide || this.side === THREE.BackSide)
            {
                If(frontFacing.not(), () => { reorientedNormal.mulAssign(-1) })
            }

            // Light bounce
            if(this.hasLightBounce)
            {
                const bounceOrientation = reorientedNormal.dot(vec3(0, - 1, 0)).smoothstep(this.game.lighting.lightBounceEdgeLow, this.game.lighting.lightBounceEdgeHigh)
                const bounceDistance = this.game.lighting.lightBounceDistance.sub(max(0, positionWorld.y)).div(this.game.lighting.lightBounceDistance).max(0).pow(2)
                const terrainData = this.game.terrain.terrainNode(positionWorld.xz)
                const bounceColor = this.game.terrain.colorNode(terrainData)
                outputColor.assign(mix(outputColor, bounceColor, bounceOrientation.mul(bounceDistance).mul(this.game.lighting.lightBounceMultiplier)))
            }

            // Water
            if(this.hasWater)
            {
                const nearWaterSurface = positionWorld.y.sub(this.game.water.surfaceElevationUniform).abs().greaterThan(this.game.water.surfaceThicknessUniform)
                outputColor.assign(nearWaterSurface.select(outputColor, color('#ffffff')))
                baseColor.assign(nearWaterSurface.select(baseColor, color('#ffffff')))
            }

            // Light
            outputColor.mulAssign(this.game.lighting.colorUniform.mul(this.game.lighting.intensityUniform))

            // Core shadow
            let coreShadowMix = float(0)
            if(this.hasCoreShadows)
                coreShadowMix = reorientedNormal.dot(this.game.lighting.directionUniform).smoothstep(this.game.lighting.coreShadowEdgeHigh, this.game.lighting.coreShadowEdgeLow)
            
            // Cast shadow
            let dropShadowMix = float(0)
            if(this.hasDropShadows)
                dropShadowMix = catchedShadow.oneMinus()

            // Combined shadows
            if(this.hasCoreShadows || this.hasDropShadows)
            {
                const combinedShadowMix = max(coreShadowMix, dropShadowMix, this._shadowNode).clamp(0, 1)
                
                const shadowColor = baseColor.rgb.mul(this.game.lighting.shadowColor).rgb
                outputColor.assign(mix(outputColor, shadowColor, combinedShadowMix))
            }
            
            // Fog
            if(this.hasFog)
                outputColor.assign(this.game.fog.strength.mix(outputColor, this.game.fog.color))

            // Alpha test discard
            this._alphaNode.lessThan(this.alphaTest).discard()

            // Reveal
            if(this.hasReveal)
                outputColor.assign(MeshDefaultMaterial.revealDiscardNodeBuilder(this.game, outputColor))

            // Output
            return vec4(outputColor, this._alphaNode)
        })()
    }
}
```

```javascript name=sources/Game/Ligthing.js url=https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/Ligthing.js
export class Lighting
{
    constructor()
    {
        this.game = Game.getInstance()

        this.useDayCycles = true
        this.phi = 0.63
        this.theta = 0.72
        this.phiAmplitude = 0.62
        this.thetaAmplitude = 1.25
        this.near = 1
        this.spherical = new THREE.Spherical(this.game.view.optimalArea.radius + this.near, this.phi, this.theta)
        this.direction = new THREE.Vector3().setFromSpherical(this.spherical).normalize()
        this.directionUniform = uniform(this.direction)
        this.colorUniform = uniform(color('#ffffff'))
        this.intensityUniform = uniform(1)
        this.count = 1
        this.mapSize = this.game.quality.level === 0 ? 2048 : 512
        this.shadowAmplitude = this.game.view.optimalArea.radius
        this.depth = this.game.view.optimalArea.radius * 2
        this.shadowBias = -0.001
        this.shadowNormalBias = 0.1
        this.shadowRadius = this.game.quality.level === 0 ? 3 : 2

        if(this.game.debug.active)
        {
            this.debugPanel = this.game.debug.panel.addFolder({
                title: '💡 Lighting',
                expanded: false,
            })
        }

        this.setNodes()
        this.setLight()
        this.updateShadow()
        this.setHelpers()

        this.game.ticker.events.on('tick', () =>
        {
            this.update()
        }, 9)

        this.game.viewport.events.on('throttleChange', () =>
        {
            this.spherical.radius = this.game.view.optimalArea.radius
            this.shadowAmplitude = this.game.view.optimalArea.radius
            this.updateShadow()
        }, 3)

        // Debug
        if(this.game.debug.active)
        {
            this.debugPanel.addBinding(this, 'useDayCycles')
            this.debugPanel.addBinding(this, 'phi', { min: 0, max: Math.PI * 0.5 }).on('change', () => this.updateCoordinates())
            this.debugPanel.addBinding(this, 'theta', { min: - Math.PI, max: Math.PI }).on('change', () => this.updateCoordinates())
            this.debugPanel.addBinding(this, 'phiAmplitude', { min: 0, max: Math.PI}).on('change', () => this.updateCoordinates())
            this.debugPanel.addBinding(this, 'thetaAmplitude', { min: - Math.PI, max: Math.PI }).on('change', () => this.updateCoordinates())
            this.debugPanel.addBinding(this.spherical, 'radius', { min: 0, max: 100 }).on('change', () => this.updateCoordinates())
            this.debugPanel.addBlade({ view: 'separator' })
            this.debugPanel.addBinding(this, 'near', { min: 0.1, max: 50, step: 0.1 }).on('change', () => this.updateShadow())
            this.debugPanel.addBinding(this, 'depth', { min: 0.1, max: 100, step: 0.1 }).on('change', () => this.updateShadow())
            this.debugPanel.addBinding(this, 'shadowAmplitude', { min: 1, max: 50 }).on('change', () => this.updateShadow())
            this.debugPanel.addBinding(this, 'shadowBias', { min: -0.02, max: 0.02 }).on('change', () => this.updateShadow())
```

```javascript name=sources/Game/Terrain.js url=https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/Terrain.js
                title: '🏔️ Terrain Data',
                expanded: false,
            })
        }

        this.setGradient()
        this.setNodes()

        this.game.ticker.events.on('tick', () =>
        {
            this.update()
        }, 10)
    }

    setGradient()
    {
        const height = 16

        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = height

        this.gradientTexture = new THREE.Texture(canvas)
        this.gradientTexture.colorSpace = THREE.SRGBColorSpace

        const context = canvas.getContext('2d')

        this.colors = [
            { stop: 0.1, value: '#ffa94e' },
            { stop: 0.3, value: '#5bc2b9' },
            { stop: 0.9, value: '#13375f' },
        ]

        const update = () =>
        {
            const gradient = context.createLinearGradient(0, 0, 0, height)
            for(const color of this.colors)
                gradient.addColorStop(color.stop, color.value)

            context.fillStyle = gradient
            context.fillRect(0, 0, 1, height)
            this.gradientTexture.needsUpdate = true
        }

        update()

        // // Debug
        // canvas.style.position = 'fixed'
        // canvas.style.zIndex = 999
        // canvas.style.top = 0
        // canvas.style.left = 0
        // canvas.style.width = '128px'
        // canvas.style.height = `256px`
        // document.body.append(canvas)
        
        if(this.game.debug.active)
        {
            for(const color of this.colors)
            {
                this.debugPanel.addBinding(color, 'stop', { min: 0, max: 1, step: 0.001 }).on('change', update)
                this.debugPanel.addBinding(color, 'value', { view: 'color' }).on('change', update)
            }
        }
    }

    setNodes()
    {
        this.grassColorUniform = uniform(color('#b8b62e'))
        this.tracksDelta = uniform(vec2(0))

        const worldPositionToUvNode = Fn(([position]) =>
        {
            return position.div(this.subdivision).div(1.5).add(0.5)
        })

        this.terrainNode = Fn(([position]) =>
        {
            const textureUv = worldPositionToUvNode(position)
            const data = texture(this.game.resources.terrainTexture, textureUv)

            // Wheel tracks
            const groundDataColor = texture(
                this.game.tracks.renderTarget.texture,
                position.sub(- this.game.tracks.halfSize).sub(this.tracksDelta).div(this.game.tracks.size)
            )
            data.g.mulAssign(groundDataColor.r.oneMinus())

            return data
        })
        
        this.colorNode = Fn(([terrainData]) =>
        {
            // Dirt and water
            const baseColor = texture(this.gradientTexture, vec2(0, terrainData.b.oneMinus()))

            // Grass
            baseColor.assign(mix(baseColor, this.grassColorUniform, terrainData.g))

            return baseColor.rgb
        })

        if(this.game.debug.active)
        {
            this.game.debug.addThreeColorBinding(this.debugPanel, this.grassColorUniform.value, 'grassColor')
        }
    }
    
    update()
    {
        // Tracks delta
        this.tracksDelta.value.set(
            this.game.tracks.focusPoint.x,
            this.game.tracks.focusPoint.y
        )
    }
}
```

Mau saya sertakan juga World.js lagi atau file lain (mis. Grass/Leaves) dalam format yang sama? Atau mau penjelasan singkat per file tentang bagian yang perlu kamu ubah (mis. agar displacement lebih kuat atau menambah intensity light-bounce)?