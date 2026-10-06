package ru.titan.menu

import android.content.Context
import android.view.ViewGroup

/**
 * Поворачивает содержимое целиком. Приставка всегда отдаёт по HDMI горизонтальную картинку,
 * а телевизор висит вертикально: ребёнок получает «книжный» размер (ширина и высота меняются
 * местами) и поворачивается вокруг центра — страница меню видит обычный вертикальный экран.
 */
class RotatedLayout(context: Context) : ViewGroup(context) {
    var angle: Int = 0
        set(value) {
            field = value
            requestLayout()
        }

    private val swapped get() = angle == 90 || angle == 270

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val height = MeasureSpec.getSize(heightMeasureSpec)
        setMeasuredDimension(width, height)
        val childWidth = MeasureSpec.makeMeasureSpec(if (swapped) height else width, MeasureSpec.EXACTLY)
        val childHeight = MeasureSpec.makeMeasureSpec(if (swapped) width else height, MeasureSpec.EXACTLY)
        for (i in 0 until childCount) getChildAt(i).measure(childWidth, childHeight)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val width = r - l
        val height = b - t
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            val left = (width - child.measuredWidth) / 2
            val top = (height - child.measuredHeight) / 2
            child.layout(left, top, left + child.measuredWidth, top + child.measuredHeight)
            child.pivotX = child.measuredWidth / 2f
            child.pivotY = child.measuredHeight / 2f
            child.rotation = angle.toFloat()
        }
    }
}
