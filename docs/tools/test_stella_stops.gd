extends SceneTree
# Stella's distractions: a hydrant she hasn't marked (she pees on it, rooted there,
# with Nicole held at the end of the leash), and a squirrel that bolts up a tree
# (she chases it, then barks up at it, rooted, until it settles). Lingering brings zombies.
#   godot --headless --fixed-fps 60 --path . --script docs/tools/test_stella_stops.gd
const Helpers := preload("res://docs/tools/world_helpers.gd")

func _fresh():
	var main = load("res://scenes/Main.tscn").instantiate()
	main.home_seed = 1
	main.traffic_enabled = false
	root.add_child(main)
	for i in 3:
		await process_frame
	for c in main.cops:
		c.set_process(false)
	for cat in main.cats:
		cat.set_process(false)
	for n in main.npcs:
		n.set_process(false)
	return main

func _init() -> void:
	var main = await _fresh()
	var zombies: int = main.npcs.filter(func(n): return n.kind == n.Kind.ZOMBIE).size()
	print("0. hydrants ", main.hydrants.size(), ", trees ", main.trees.size(), ", squirrels ", main.squirrels.size(), ", zombies ", zombies,
		"  ok: ", main.hydrants.size() >= 30 and main.squirrels.size() >= 5 and zombies >= 6)

	# 1. Stella sees a hydrant: she goes to it, pees (rooted), and Nicole is held at the leash's end.
	var h = main.hydrants[0]
	var hc: Vector2 = h.rect.get_center()
	var away: Vector2 = Helpers.free_spot(main, hc + Vector2(0, 60))
	main.player.global_position = away
	main.dog.global_position = Helpers.free_spot(main, hc + Vector2(30, 0))
	main.dog.pee_cd = 0.0
	main.state = "play"
	var peed := false
	for i in 240:
		await physics_frame
		if main.dog.planted == "pee":
			peed = true
			break
	var rooted_at: Vector2 = main.dog.global_position
	# Nicole tries to walk away; the leash must hold her.
	var dir: Vector2 = (away - rooted_at).normalized()
	var held_ok := true
	for i in 90:
		await physics_frame
		main.player.global_position = main.slide(main.player.global_position, dir * 85.0 / 60.0, 5.0)
		if main.player.global_position.distance_to(main.dog.global_position) > main.dog.LEASH + 6.0:
			held_ok = false
	var stayed: bool = main.dog.global_position.distance_to(rooted_at) < 3.0
	print("1. she pees on the hydrant: ", peed, " (marked: ", h.marked, "), stayed put: ", stayed, ", Nicole held within the leash: ", held_ok,
		"  ok: ", peed and h.marked and held_ok and stayed)
	for i in 200:
		await physics_frame
	print("   afterwards she is free again: ", main.dog.planted == "", "  ok: ", main.dog.planted == "")
	# a marked hydrant is not used twice
	main.dog.pee_cd = 0.0
	main.dog.global_position = Helpers.free_spot(main, hc + Vector2(30, 0))
	for i in 60:
		await physics_frame
	print("   a marked hydrant is ignored: ", main.dog.planted == "", "  ok: ", main.dog.planted == "")

	# 2. A squirrel bolts up a tree; Stella chases it and barks up at the tree, rooted.
	var sq = main.squirrels[0]
	main.dog.pee_cd = 999.0
	main.player.global_position = Helpers.free_spot(main, sq.global_position + Vector2(50, 40))
	main.dog.global_position = Helpers.free_spot(main, sq.global_position + Vector2(40, 30))
	var treed := false
	var barked := false
	for i in 600:
		await physics_frame
		if sq.state == sq.State.TREED:
			treed = true
		if main.dog.planted == "tree":
			barked = true
			break
	print("2. squirrel treed: ", treed, ", Stella barking up at it: ", barked, "  ok: ", treed and barked)
	var gave_up := false
	for i in 1500:
		await physics_frame
		if main.dog.planted == "":
			gave_up = true
			break
	print("   she stops once it settles: ", gave_up, "  ok: ", gave_up)
	main.queue_free()
	await process_frame

	# 3. Standing about brings zombies from outside the view.
	main = await _fresh()
	main.traffic_director.enabled = true
	main.player.global_position = Helpers.free_spot(main, main.START + Vector2(600, -300))
	main.dog.global_position = main.player.global_position
	main.dog.set_process(false)
	for i in 60 * 14:
		await physics_frame
	var drift: Array = main.npcs.filter(func(n): return n.drifter)
	var nearest := INF
	for z in drift:
		nearest = minf(nearest, z.global_position.distance_to(main.player.global_position))
	print("3. after 14 s standing about: drifting zombies ", drift.size(), " (nearest ", snappedf(nearest, 1.0), ")  ok: ", drift.size() >= 1 and nearest > 350.0)
	quit()
